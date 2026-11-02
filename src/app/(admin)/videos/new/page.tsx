"use client";
import { PageHeader } from "@/components/ui";
import { VideoForm } from "@/components/video-form";

export default function NewVideoPage() {
  return (
    <>
      <PageHeader title="Add video" sub="Manual inventory entry — use “Read” to pull real metadata from the file when it exists." />
      <VideoForm />
    </>
  );
}
