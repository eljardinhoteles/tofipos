export function FloatingNavbar() {
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-3">
      <div id="floating-actions-left" className="pointer-events-auto flex items-center gap-2" />
      <div id="floating-actions-right" className="pointer-events-auto flex items-center gap-2" />
    </div>
  );
}
