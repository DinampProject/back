import User from "../../models/user.js";
import asyncHandler from 'express-async-handler';

// controllers/user.js
export const fetchUser = async (req, res) => {
  try {
    const { uid, name, email, image } = req.body;

    if (!uid || !name || !email || !image) {
      return res.status(400).json({ message: 'uid, name, email, image required' });
    }

    const user = await User.findOneAndUpdate(
      { email },                                     // lookup by e-mail
      {                                             // only if NOT found
        $setOnInsert: { uid, name, email, image }   //  ← include uid!
      },
      { new: true, upsert: true }
    ).lean();

    const existed = await User.exists({ email });
    return res.status(existed ? 200 : 201).json({
      message: existed ? 'User already exists' : 'User created',
      user,
    });
  } catch (err) {
    console.error('fetchUser error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateUser = asyncHandler(async (req, res) => {
  const { uid, updates } = req.body;
  if (!uid || !updates) {
    return res.status(400).json({ message: 'uid and updates are required' });
  }

  const allowedUpdates = ['connections', 'settings', 'name', 'image'];
  const updateKeys = Object.keys(updates);
  const isValidUpdate = updateKeys.every((key) => allowedUpdates.includes(key));
  if (!isValidUpdate) {
    return res.status(400).json({ message: 'Invalid update fields' });
  }

  const user = await User.findOneAndUpdate(
    { uid },
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json({ message: 'User updated', user });
});
