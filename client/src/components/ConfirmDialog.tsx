import { useEffect, useRef } from "react";
import { ShieldCheck, X } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
        <button className="dialog-close" aria-label="Close confirmation" onClick={onCancel}><X size={17} /></button>
        <div className={`dialog-icon ${destructive ? "danger" : ""}`}><ShieldCheck size={22} /></div>
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-description">{description}</p>
        <div className="dialog-actions">
          <button className="outline-btn" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={destructive ? "danger-btn" : "primary-btn"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
