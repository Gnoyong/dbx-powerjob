import { DayPicker, type DayPickerProps } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";

function Calendar({ className, ...props }: DayPickerProps) {
  return <DayPicker className={cn("job-calendar", className)} {...props} />;
}

export { Calendar };
