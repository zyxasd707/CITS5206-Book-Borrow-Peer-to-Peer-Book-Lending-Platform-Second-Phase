"use client";

import React from "react";
import Link from "next/link";
import Button from "../components/ui/Button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 sm:-mt-16 sm:pt-16">
      <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-gray-900 mb-6 text-center">
        Find Your Next Reading
      </h1>
      <div className="w-full max-w-sm sm:max-w-none flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
        <Link href="/login" className="w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-32 py-3">
            Login
          </Button>
        </Link>
        <Link href="/register" className="w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-32 py-3">
            Sign Up
          </Button>
        </Link>
      </div>
    </div>
  );
}
