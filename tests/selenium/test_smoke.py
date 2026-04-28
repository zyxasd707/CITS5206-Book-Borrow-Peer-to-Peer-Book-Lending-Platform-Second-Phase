import os
import unittest
from urllib.parse import urljoin

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


BASE_URL = os.getenv("BASE_URL", "http://localhost").rstrip("/")
BROWSER = os.getenv("SELENIUM_BROWSER", "chrome").lower()
HEADLESS = os.getenv("SELENIUM_HEADLESS", "1") != "0"


def build_driver():
    if BROWSER == "safari":
        return webdriver.Safari()

    if BROWSER == "firefox":
        options = webdriver.FirefoxOptions()
        if HEADLESS:
            options.add_argument("-headless")
        return webdriver.Firefox(options=options)

    if BROWSER == "edge":
        options = webdriver.EdgeOptions()
        if HEADLESS:
            options.add_argument("--headless=new")
        options.add_argument("--window-size=1440,1000")
        return webdriver.Edge(options=options)

    options = webdriver.ChromeOptions()
    if HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,1000")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")
    return webdriver.Chrome(options=options)


class BookBorrowSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.driver = build_driver()
        cls.wait = WebDriverWait(cls.driver, 15)
        cls.long_wait = WebDriverWait(cls.driver, 25)
        cls.driver.get(urljoin(f"{BASE_URL}/", ""))
        cls.wait.until(
            lambda driver: driver.execute_script("return document.readyState") == "complete"
        )
        cls.driver.delete_all_cookies()
        try:
            cls.driver.execute_script("window.localStorage.clear(); window.sessionStorage.clear();")
        except Exception:
            pass

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def open_path(self, path):
        self.driver.get(urljoin(f"{BASE_URL}/", path.lstrip("/")))
        self.wait_for_ready()
        self.wait_for_app_shell()

    def wait_for_ready(self):
        self.wait.until(
            lambda driver: driver.execute_script("return document.readyState") == "complete"
        )

    def wait_for_app_shell(self, min_chars=40):
        """Wait until the client shell is past generic full-screen loading placeholders."""

        def meaningful_content(driver):
            raw = driver.find_element(By.TAG_NAME, "body").text
            stripped = raw.strip()
            if len(stripped) < min_chars:
                return False
            if "Loading..." in raw:
                return False
            return True

        self.long_wait.until(meaningful_content)

    def page_text(self):
        return self.driver.find_element(By.TAG_NAME, "body").text

    def assert_no_obvious_next_error(self):
        text = self.page_text()
        blocked_phrases = [
            "Application error",
            "Internal Server Error",
            "Unhandled Runtime Error",
            "This page could not be found",
        ]
        for phrase in blocked_phrases:
            self.assertNotIn(phrase, text)

    def fetch_status(self, path):
        self.driver.get(urljoin(f"{BASE_URL}/", "/"))
        self.wait_for_ready()
        self.wait_for_app_shell()
        script = """
            const done = arguments[arguments.length - 1];
            fetch(arguments[0], { method: "GET" })
                .then((response) => done({ status: response.status, type: response.headers.get("content-type") || "" }))
                .catch((error) => done({ status: 0, error: String(error) }));
        """
        return self.driver.execute_async_script(script, path)

    def test_public_routes_load_successfully(self):
        expected_routes = [
            "/",
            "/login",
            "/register",
            "/books",
            "/checkout",
            "/message",
            "/borrowing",
            "/admin/user-metrics",
            "/admin/analytics",
            "/admin/complaints",
            "/shipping",
        ]

        for path in expected_routes:
            with self.subTest(path=path):
                self.open_path(path)
                self.assert_no_obvious_next_error()
                self.assertGreater(len(self.page_text()), 20)

    def test_login_and_register_forms_are_available(self):
        self.open_path("/login")
        self.driver.find_element(By.CSS_SELECTOR, "input[type='email']")
        self.driver.find_element(By.CSS_SELECTOR, "input[type='password']")
        self.assertIn("Sign In", self.page_text())

        self.open_path("/register")
        self.driver.find_element(By.CSS_SELECTOR, "input[type='email']")
        self.driver.find_element(By.CSS_SELECTOR, "input[type='password']")
        self.assertIn("Create", self.page_text())

    def test_checkout_guest_fallback_is_visible(self):
        self.open_path("/checkout")
        url = self.driver.current_url
        text = self.page_text()
        if "/auth" in url:
            self.assertIn("Find Your Next Reading", text)
            self.assertIn("Login", text)
        else:
            self.assertIn("/checkout", url)
            self.assertTrue(
                any(
                    phrase in text
                    for phrase in [
                        "Login required",
                        "Preparing checkout",
                        "sign in to continue",
                        "Your checkout is empty",
                        "Checkout unavailable",
                    ]
                ),
                text,
            )
        self.assert_no_obvious_next_error()

    def test_books_api_is_reachable_through_nginx(self):
        result = self.fetch_status("/api/v1/books?page=1&page_size=5")
        self.assertEqual(result["status"], 200, result)
        self.assertIn("application/json", result["type"])

    def test_api_root_reaches_backend(self):
        result = self.fetch_status("/api/")
        self.assertEqual(result["status"], 404, result)
        self.assertIn("application/json", result["type"])

    def test_mobile_message_page_smoke(self):
        self.driver.set_window_size(390, 844)
        try:
            self.open_path("/message")
        except TimeoutException:
            self.fail("Message page did not finish loading in mobile viewport")
        self.assert_no_obvious_next_error()
        self.assertGreater(len(self.page_text()), 20)


if __name__ == "__main__":
    unittest.main()
