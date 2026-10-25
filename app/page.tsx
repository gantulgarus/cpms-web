import { redirect } from "next/navigation";

/** Нүүр хуудас нь хянах самбар. */
export default function HomePage() {
  redirect("/dashboard");
}
