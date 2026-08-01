import { notFound } from "next/navigation";
import { getCourse } from "@/lib/store";
import CoursePlayer from "@/components/course-player";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();
  return <CoursePlayer course={course} />;
}
