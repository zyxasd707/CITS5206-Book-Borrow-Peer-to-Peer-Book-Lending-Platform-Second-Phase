"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Card from "../components/ui/Card";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { resetPassword } from "../../utils/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!token || !email) {
    return (
      <div className="text-center space-y-4">
        <p className="text-red-600">Invalid or missing reset link.</p>
        <Link href="/forgot-password" className="text-blue-600 hover:text-blue-700 text-sm">
          Request a new reset link
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(email, token, newPassword, confirmPassword);
      toast.success("Password reset successfully! Please sign in.");
      router.push("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="New Password"
        isPassword
        placeholder="Enter new password"
        leftIcon={<Lock className="w-4 h-4" />}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      <Input
        label="Confirm Password"
        isPassword
        placeholder="Confirm new password"
        leftIcon={<Lock className="w-4 h-4" />}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      <Button type="submit" fullWidth isLoading={isLoading}>
        {isLoading ? "Resetting..." : "Reset Password"}
      </Button>
      <div className="text-center text-sm text-gray-600">
        <Link href="/login" className="text-blue-600 hover:text-blue-700">
          Back to Sign In
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex-1 bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Reset Password</h1>
          <p className="text-gray-600">Enter your new password below.</p>
        </div>
        <Suspense fallback={<p className="text-center text-gray-500">Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
      </Card>
    </div>
  );
}
