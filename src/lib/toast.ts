import { toast } from "sonner";

export const showToast = {
  success: (title: string, description?: string) => {
    toast.success(title, { description });
  },
  error: (title: string, description?: string) => {
    toast.error(title, { description });
  },
  info: (title: string, description?: string) => {
    toast.info(title, { description });
  },
  warning: (title: string, description?: string) => {
    toast.warning(title, { description });
  },
  promise: <T>(
    promise: Promise<T>,
    data: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return toast.promise(promise, data);
  }
};
