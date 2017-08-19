const {ObjectID} = require('mongodb')
const {URl} = require('url')
const pubsub = require('../pubsub')

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

function assertValidLink ({url}) {
  try {
    new URL(url);
  } catch (error) {
    throw new ValidationError('Link validation error: invalid url.', 'url');
  }
}

module.exports = {
  Query: {
    allLinks: async (root, data, {mongo: {Links}}) => {
      return await Links.find({}).toArray();
    },
  },

  Mutation: {
    createLink: async (root, data, {mongo: {Links}, user}) => {
      assertValidLink(data)
      const newLink = Object.assign({postedById: user && user._id}, data)
      const response = await Links.insert(newLink);

      newLink.id = response.insertedIds[0]
      pubsub.publish('Link', {Link: {mutation: 'CREATED', node: newLink}});

      return newLink;
    },

    createUser: async (root, data, {mongo: {Users}}) => {
      const newUser = {
        name: data.name,
        email: data.authProvider.email.email,
        password: data.authProvider.email.password
      };

      const response = await Users.insert(newUser);
      return Object.assign({id: response.insertedIds[0]}, newUser);
    },

    signinUser: async (root, data, {mongo: {Users}}) => {
      const user = await Users.findOne({email: data.email.email});
      if (data.email.password === user.password) {
        return {token: `token-${user.email}`, user};
      }
    },

    createVote: async (root, data, {mongo: {Votes}, user}) => {
      const newVote = {
        userId: user && user._id,
        linkId: new ObjectID(data.linkId),
      };
      const response = await Votes.insert(newVote);
      return Object.assign({id: response.insertedIds[0]}, newVote);
    },
  },

  Subscription: {
    Link: {
      subscribe: () => pubsub.asyncIterator('link')
    }
  },

  User: {
    // Convert the "_id" field from MongoDB to "id" from the schema.
    id: root => root._id || root.id,

    votes: async ({_id}, data, {mongo: {Votes}}) => {
      return await Votes.find({userId: _id}).toArray();
    },
  },

  Vote: {
    id: root => root._id || root.id,

    user: async ({userId}, data, {mongo: {userLoader}}) => {
      return await userLoader.load(userId);
    },

    link: async ({linkId}, data, {mongo: {Links}}) => {
      return await Links.findOne({_id: linkId});
    },
  },

  Link: {
    id: root => root._id || root.id,

    postedBy: async ({postedById}, data, {mongo: {userLoader}}) => {
      return await userLoader.load(postedById);
    },

    votes: async ({_id}, data, {mongo: {Votes}}) => {
      return await Votes.find({linkId: _id}).toArray();
    },
  },
};
