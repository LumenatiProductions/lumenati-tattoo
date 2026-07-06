"use client";

// The one interactive bit of the print-card page.
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        background: "#ff1493",
        color: "#fff",
        border: "none",
        borderRadius: 10,
        padding: "10px 22px",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Print the card
    </button>
  );
}
