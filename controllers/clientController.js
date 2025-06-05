import User from "../models/user.js";
import asyncHandler from "express-async-handler";
import { v4 as uuidv4 } from "uuid";

export const getClients = asyncHandler(async (req, res) => {
  const {
    page = 0,
    limit = 10,
    clientName,
    campaignName,
  } = req.query;

  // inside the clients array. Use a $elemMatch so we can page and project easily.
  if (clientName) {
    filter["clients"] = {
      $elemMatch: { "name": clientName }
    };
  }

  // If campaignName is provided, match any client whose campaigns array has name=campaignName.
  if (campaignName) {
    // If we've already set filter.clients to an $elemMatch, we need to combine.
    // Easiest is to use $and on two elemMatch conditions:
    const clientFilter = filter.clients?.$elemMatch || null;
    delete filter.clients;

    filter.$and = [];

    if (clientFilter) {
      filter.$and.push({ clients: { $elemMatch: clientFilter } });
    }

    filter.$and.push({
      clients: { $elemMatch: { "campaigns.name": campaignName } }
    });
  }

  try {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    // Find the parent user, project only the matching clients slice
    // (if filters are applied). For simplicity, we’ll pull the entire user doc
    // and then slice/paginate on the clients array in JavaScript.
    const userDoc = await User.findOne({ uid: userId }).lean();
    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    // Now filter/paginate the in‐memory `userDoc.clients` array:
    let matchedClients = userDoc.clients || [];

    // If clientName filter was provided, filter by that:
    if (clientName) {
      matchedClients = matchedClients.filter((c) =>
        c.name === clientName
      );
    }

    // If campaignName filter was provided, further filter:
    if (campaignName) {
      matchedClients = matchedClients.filter((c) =>
        Array.isArray(c.campaigns) &&
        c.campaigns.some((camp) => camp.name === campaignName)
      );
    }

    const total = matchedClients.length;
    const totalPages = Math.ceil(total / limitNum);

    // Slice out the requested page
    const clientsPage = matchedClients.slice(
      pageNum * limitNum,
      pageNum * limitNum + limitNum
    );

    return res.json({
      clients: clientsPage,
      total,
      totalPages,
    });
  } catch (error) {
    console.error("getClients error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export const createClient = asyncHandler(async (req, res) => {
  const { userId, client } = req.body;
  if (!userId || !client) {
    return res
      .status(400)
      .json({ message: "userId and client object are required" });
  }

  if (!client.name || client.name.trim() === "") {
    return res
      .status(400)
      .json({ message: "client.name is required" });
  }

  try {
    // 1. Assign a new UUID to the client.userId field
    client.userId = uuidv4();
    // 2. Push the new client into the `clients` array of the parent User
    const updatedUser = await User.findOneAndUpdate(
      { uid: userId },
      { $push: { clients: client } },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ message: "Client added", client });
  } catch (error) {
    console.error("createClient error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export const updateClient = asyncHandler(async (req, res) => {
  const { userId, clientId, campaigns } = req.body;

  if (!userId || !clientId || !Array.isArray(campaigns)) {
    return res
      .status(400)
      .json({ message: "userId, clientId, and campaigns array are required" });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      {
        uid: userId,
        "clients._id": clientId,
      },
      {
        // The positional `$` operator refers to the matching client subdoc
        $set: {
          "clients.$.campaigns": campaigns,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.json({ message: "Client campaigns updated", clientId, campaigns });
  } catch (error) {
    console.error("updateClient error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /clients
 * Removes a single client sub‐document by its ObjectId (`clientId`), under the parent user.
 * Expects in the body:
 *   {
 *     userId: "PARENT_USER_UID",
 *     clientId: "CLIENT_SUBDOC_ID"
 *   }
 */
export const deleteClient = asyncHandler(async (req, res) => {
  const { userId, clientId } = req.body;

  if (!userId || !clientId) {
    return res
      .status(400)
      .json({ message: "userId and clientId are required" });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { uid: userId, "clients._id": clientId },
      { $pull: { clients: { _id: clientId } } },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.json({ message: "Client deleted", clientId });
  } catch (error) {
    console.error("deleteClient error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});
