# Selenium Smoke Tests

These tests cover browser-level smoke checks for the BookBorrow frontend and public API routing.

By default, the tests target a local deployment:

```bash
python3 -m venv .venv-selenium
source .venv-selenium/bin/activate
pip install -r tests/selenium/requirements.txt
BASE_URL=http://localhost python -m unittest discover -s tests/selenium
```

To run the same read-only smoke checks against the deployed VPS site:

```bash
BASE_URL=https://www.bookborrow.org python -m unittest discover -s tests/selenium
```

## Safety

- The tests only load pages and perform GET requests.
- They do not submit login, registration, checkout, payment, email, or admin forms.
- Running with `BASE_URL=https://www.bookborrow.org` should not create or modify production data.
- Guest users hitting protected routes (for example `/checkout`) are redirected to `/auth` by `AuthProvider`; the checkout test accepts either that redirect or an in-page "login required" state if protection rules change.

## Optional Environment Variables

- `BASE_URL`: target site URL. Defaults to `http://localhost`.
- `SELENIUM_BROWSER`: `chrome`, `edge`, `firefox`, or `safari`. Defaults to `chrome`.
- `SELENIUM_HEADLESS`: set to `0` to show the browser. Defaults to headless mode.

Safari does not support Selenium headless mode. If using Safari on macOS, enable Remote Automation in Safari's Develop menu and run:

```bash
SELENIUM_BROWSER=safari SELENIUM_HEADLESS=0 BASE_URL=http://localhost python -m unittest discover -s tests/selenium
```
