export const getCSRFToken = () => {
  const cookies = document.cookie.split(";");

  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split("=");

    if (name === "csrftoken") {
      return value;
    }
  }

  return null;
};
