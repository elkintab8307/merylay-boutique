import Image from "next/image";

export function SiteLogo({ size = "header" }: { size?: "header" | "sheet" }) {
  const isSheet = size === "sheet";
  const dimension = isSheet ? 72 : 40;

  return (
    <span className={`flex items-center gap-2 ${isSheet ? "flex-col text-center" : ""}`}>
      <Image
        src="/brand/logo-principal.png"
        alt=""
        width={dimension}
        height={dimension}
        className={
          isSheet
            ? "h-18 w-18 object-contain"
            : "h-10 w-10 object-contain md:h-11 md:w-11"
        }
      />
      <span className="flex flex-col leading-none">
        <span className={`font-script text-brand-rosa ${isSheet ? "text-3xl" : "text-2xl"}`}>
          Mery Lay
        </span>
        <span className="text-[10px] font-semibold tracking-[0.35em] text-brand-ciruela">
          BOUTIQUE
        </span>
      </span>
    </span>
  );
}
