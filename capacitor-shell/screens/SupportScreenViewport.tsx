import { SupportScreen } from "./SupportScreen";

export function SupportScreenViewport() {
  return (
    <div className="seza-support-viewport h-full min-h-0 w-full overflow-hidden">
      <style>{`
        .seza-support-viewport > div {
          height: 100% !important;
          min-height: 0 !important;
          overflow: hidden !important;
          padding-bottom: 0 !important;
        }

        .seza-support-viewport > div > .min-h-full {
          height: 100% !important;
          min-height: 0 !important;
          overflow-y: auto !important;
          overscroll-behavior: contain;
          touch-action: pan-y;
          -webkit-overflow-scrolling: touch;
        }

        .seza-support-viewport > div > .min-h-full:has(> .border-t.bg-background) {
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
          padding-bottom: 0 !important;
        }

        .seza-support-viewport > div > .min-h-full:has(> .border-t.bg-background) > div:first-child {
          min-height: 0 !important;
          flex: 1 1 auto !important;
          overflow-y: auto !important;
          overscroll-behavior: contain;
          touch-action: pan-y;
          -webkit-overflow-scrolling: touch;
        }

        .seza-support-viewport > div > .min-h-full:has(> .border-t.bg-background) > .border-t.bg-background {
          position: relative;
          z-index: 20;
          flex: 0 0 auto !important;
          padding-bottom: max(.5rem, env(safe-area-inset-bottom));
        }
      `}</style>
      <SupportScreen />
    </div>
  );
}
