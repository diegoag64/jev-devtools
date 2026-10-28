import * as React from "react";
import "./native-select.css";

function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <span className="playground-select" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        data-size={size}
        className={className}
        {...props}
      />
    </span>
  );
}

function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

export { NativeSelect, NativeSelectOption };
