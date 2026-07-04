export const sendSuccess = (
  res,
  statusCode,
  message,
  data = null
) => {
  const response = {
    success: true,
    message,
  };

  if (data !== null) {
    response.data = data;
  }

  res.status(statusCode).json(response);
};

export const sendSuccessWithCount = (
  res,
  statusCode,
  message,
  count,
  data
) => {
  res.status(statusCode).json({
    success: true,
    message,
    count,
    data,
  });
};