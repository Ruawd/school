const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const Venue = require('../models/Venue');

const VENUE_TOKEN_PREFIX = 'VENUE_TOKEN:';

const buildVenueCheckinCode = (venueOrToken) => {
  const token = typeof venueOrToken === 'string' ? venueOrToken : venueOrToken?.checkin_token;
  return `${VENUE_TOKEN_PREFIX}${token}`;
};

const ensureVenueCheckinToken = async (venue, transaction = null) => {
  if (!venue) return null;
  if (venue.checkin_token) return venue;
  await venue.update({ checkin_token: uuidv4() }, { transaction });
  return venue;
};

const backfillVenueCheckinTokens = async () => {
  const list = await Venue.findAll({
    where: {
      [Op.or]: [
        { checkin_token: null },
        { checkin_token: '' },
      ],
    },
  });

  for (const venue of list) {
    await venue.update({ checkin_token: uuidv4() });
  }

  return list.length;
};

const sanitizeVenueForRole = (venue, user) => {
  if (!venue) return venue;
  const plain = typeof venue.toJSON === 'function' ? venue.toJSON() : { ...venue };
  if (Number(user?.role) !== 9) {
    delete plain.checkin_token;
  }
  return plain;
};

module.exports = {
  VENUE_TOKEN_PREFIX,
  buildVenueCheckinCode,
  ensureVenueCheckinToken,
  backfillVenueCheckinTokens,
  sanitizeVenueForRole,
};
