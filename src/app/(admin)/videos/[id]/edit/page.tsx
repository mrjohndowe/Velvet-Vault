"use client";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { VideoForm } from "@/components/video-form";

export default function EditVideoPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <PageHeader title="Edit video" sub={`Inventory record #${id} — every field is editable, including auto-detected metadata.`} />
      <VideoForm videoId={Number(id)} />
    </>
  );
}
