import User from '../../models/User.js';

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
