"use client";

export default function PrintButton() {
  return (
    <div className="ag-actions">
      <button onClick={() => window.print()}>Download / print (PDF)</button>
    </div>
  );
}
