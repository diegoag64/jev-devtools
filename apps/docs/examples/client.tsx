import { JevDevtools } from "jev-devtools";

export function Root() {
  return (
    <>
      <main>Your application</main>
      <JevDevtools enabled={import.meta.env.DEV} defaultOpen={false} />
    </>
  );
}
