import { verifyCredentials, issueToken } from "../services/authService.js";
import { sendSuccess } from "../utils/response.js";
import ApiError from "../utils/ApiError.js";

export const loginController = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ApiError(400, "email and password are required.");
    }

    const employee = await verifyCredentials(email, password);
    const token = issueToken(employee);

    sendSuccess(res, 200, "Logged in successfully.", {
      token,
      user: {
        userId: employee._id.toString(),
        email: employee.email,
        role: employee.role,
      },
    });
  } catch (error) {
    next(error);
  }
};
