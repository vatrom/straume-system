"use client";

export function ConfirmSubmit({
  label,
  confirm,
  className = "btn-danger",
}: {
  label: string;
  confirm: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
