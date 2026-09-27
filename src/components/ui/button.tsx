import type { ComponentProps } from "react";
import { buttonClass, type ButtonVariantProps } from "./button-variants";

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & ButtonVariantProps) {
  return <button className={buttonClass({ variant, size, className })} {...props} />;
}
