export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-danger">
      {message}
    </p>
  );
}
