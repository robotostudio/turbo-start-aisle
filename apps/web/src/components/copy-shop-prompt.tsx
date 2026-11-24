"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { SHOP_GUIDE_PATH } from "@/lib/agent-shop";

// Brand marks from svgl (MIT), pulled from the shadcn registry items
// @svgl/claude-ai, @svgl/openai and @svgl/gemini, redrawn in currentColor so
// they follow the theme. Gemini keeps only its star outline. The logos
// remain trademarks of their owners, used here to name each assistant.
const MARKS: {
  name: string;
  viewBox: string;
  d: string;
  fillRule?: "evenodd";
}[] = [
  {
    name: "Claude",
    viewBox: "0 0 256 257",
    d: "m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z",
  },
  {
    name: "ChatGPT",
    viewBox: "105 105 400 400",
    d: "M252.794 108.802C289.191 99.0484 326.265 110.305 351.148 135.135C385.113 126.072 422.85 134.862 449.492 161.505C476.136 188.149 484.925 225.888 475.862 259.85V259.854C500.696 284.735 511.95 321.81 502.198 358.207C492.447 394.602 464.161 421.084 430.215 430.217C421.083 464.162 394.603 492.448 358.206 502.199C321.812 511.951 284.734 500.693 259.852 475.864C225.887 484.927 188.15 476.137 161.507 449.495C134.864 422.851 126.073 385.111 135.136 351.149C110.304 326.266 99.0496 289.192 108.801 252.795C118.552 216.4 146.84 189.918 180.784 180.785C189.917 146.841 216.396 118.553 252.794 108.802ZM374.292 407.145C374.292 411.271 372.092 415.086 368.517 417.148L283.723 466.102C302.487 480.585 327.555 486.459 352.217 479.852C386.997 470.532 410.068 439.312 410.555 405.006V317.717C410.555 315.08 409.125 312.621 406.843 311.303L374.292 292.509V407.145ZM251.868 415.897C248.296 417.959 243.893 417.959 240.317 415.897L155.526 366.942C152.366 390.436 159.811 415.08 177.866 433.136H177.863C203.325 458.594 241.896 462.962 271.85 446.232L347.449 402.586C349.735 401.268 351.148 398.8 351.148 396.163V358.579L251.868 415.897ZM368.602 220.628C366.319 219.309 363.474 219.318 361.191 220.637L328.641 239.431L427.921 296.749C431.496 298.811 433.697 302.627 433.697 306.752V404.661C455.622 395.654 473.244 376.881 479.851 352.218C489.169 317.442 473.668 281.85 444.201 264.274L368.602 220.628ZM177.303 206.34C155.377 215.348 137.756 234.122 131.148 258.783C121.832 293.561 137.331 329.153 166.799 346.727L242.398 390.373C244.68 391.692 247.525 391.684 249.807 390.366L282.357 371.572L183.078 314.253C179.504 312.189 177.303 308.375 177.303 304.251V206.34ZM259.849 279.145V331.858L305.5 358.213L351.15 331.858V279.145L305.5 252.789L259.849 279.145ZM327.276 144.9C308.512 130.418 283.445 124.543 258.782 131.15C224.002 140.471 200.931 171.691 200.445 205.995V293.286C200.445 295.923 201.875 298.381 204.158 299.7L236.707 318.493V203.856C236.707 199.731 238.909 195.916 242.483 193.853L327.276 144.9ZM433.137 177.867C407.675 152.407 369.103 148.038 339.149 164.769L263.55 208.415C261.265 209.734 259.852 212.202 259.852 214.838V252.423L359.132 195.105C362.703 193.041 367.108 193.041 370.682 195.105L455.473 244.06C458.635 220.567 451.189 195.922 433.135 177.867H433.137Z",
    fillRule: "evenodd",
  },
  {
    name: "Gemini",
    viewBox: "0 0 296 298",
    d: "M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z",
  },
];

const COPIED_MS = 2000;

const LABEL = "Let your agent shop for you";

const PASTE_LINE = "Now paste it in your agent";

const FAILED_LINE = "Could not copy";

const noSubscribe = () => () => undefined;

// min-h-11.5 keeps a 46px touch height. The smaller text on phones keeps the
// label on one line at 360px; below that it wraps instead of being clipped.
// Motion: hover colours and the press share one 150ms ease-out transition, so
// a release mid-press glides back. The press scale sits behind motion-safe.
const chipClass =
  "group inline-flex min-h-11.5 cursor-pointer items-center gap-2 border border-border bg-muted px-3 text-foreground text-xs outline-none transition-[background-color,border-color,scale] duration-150 ease-out hover:border-foreground/30 hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:active:scale-97 sm:text-sm";

// Both states sit in one grid cell, so the chip keeps the width of the wider
// one and nothing unmounts: a press during the swap retargets the transition.
// The state coming in takes 300ms on a firm ease-out; the one leaving takes
// 200ms. Label and icon share that timing because they change as one.
// Reduced motion drops the scale and blur and keeps a 200ms fade.
const swapClass =
  "col-start-1 row-start-1 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.25,0.1,0,1)]";
const hideOnCopy = `${swapClass} motion-safe:duration-300 group-data-[copied=true]:opacity-0 motion-safe:group-data-[copied=true]:duration-200`;
const showOnCopy = `${swapClass} opacity-0 group-data-[copied=true]:scale-100 group-data-[copied=true]:opacity-100 group-data-[copied=true]:blur-none motion-safe:group-data-[copied=true]:duration-300`;

// How far the hidden state sits from rest. Text moves a little. An icon
// shrinks deep, so the change reads as a swap and not as a glitch. The names
// are written out in full: Tailwind only generates classes it can read.
const labelHide = `${hideOnCopy} motion-safe:group-data-[copied=true]:scale-97 motion-safe:group-data-[copied=true]:blur-[2px]`;
const labelShow = `${showOnCopy} motion-safe:scale-97 motion-safe:blur-[2px]`;
const iconHide = `${hideOnCopy} motion-safe:group-data-[copied=true]:scale-30 motion-safe:group-data-[copied=true]:blur-[3px]`;
const iconShow = `${showOnCopy} motion-safe:scale-30 motion-safe:blur-[3px]`;

// The link before hydration renders the same parts, so the chip never changes width.
function ChipContent({ label = LABEL }: { label?: string }) {
  return (
    <>
      <span className="grid shrink-0 grid-flow-col gap-1">
        {MARKS.map((mark) => (
          <span
            className="inset-ring grid size-6 place-items-center bg-background inset-ring-border"
            key={mark.name}
          >
            <svg
              aria-hidden
              className="size-3 fill-current"
              viewBox={mark.viewBox}
            >
              <path
                clipRule={mark.fillRule}
                d={mark.d}
                fillRule={mark.fillRule}
              />
            </svg>
          </span>
        ))}
      </span>
      <span className="grid">
        <span className={labelHide}>{label}</span>
        <span aria-hidden className={labelShow}>
          {PASTE_LINE}
        </span>
      </span>
      <span className="grid shrink-0 text-muted-foreground">
        <Copy aria-hidden className={`size-4 ${iconHide}`} />
        <Check aria-hidden className={`size-4 ${iconShow}`} />
      </span>
    </>
  );
}

/**
 * The "Let your agent shop for you" chip. Copies `prompt` for the shopper to
 * paste into their own AI agent, then says so in the label for a moment.
 * Before hydration, and so with no JavaScript, it is a plain link to the
 * agent guide.
 */
export function CopyShopPrompt({ prompt }: { prompt: string }) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  if (!hydrated) {
    return (
      <a className={chipClass} href={SHOP_GUIDE_PATH}>
        <ChipContent />
      </a>
    );
  }

  const show = (next: "copied" | "failed") => {
    clearTimeout(timeoutRef.current);
    setState(next);
    timeoutRef.current = setTimeout(() => setState("idle"), COPIED_MS);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      show("copied");
    } catch {
      // No clipboard (an old browser or a denied permission): the guide still
      // gets the shopper's agent there. On the guide itself that would only
      // reload the page, so the chip says the copy failed instead.
      if (location.pathname === SHOP_GUIDE_PATH) {
        show("failed");
      } else {
        location.assign(SHOP_GUIDE_PATH);
      }
    }
  };

  return (
    <>
      <button
        className={chipClass}
        data-copied={state === "copied"}
        onClick={() => {
          void copy();
        }}
        type="button"
      >
        <ChipContent label={state === "failed" ? FAILED_LINE : LABEL} />
        <span className="sr-only">
          (copies a prompt for Claude, ChatGPT or Gemini)
        </span>
      </button>
      <output aria-live="polite" className="sr-only">
        {state === "copied" ? `Copied. ${PASTE_LINE}` : ""}
        {state === "failed" ? `${FAILED_LINE}. Your browser blocked it.` : ""}
      </output>
    </>
  );
}
