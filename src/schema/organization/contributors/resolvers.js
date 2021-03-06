import fetchData from '../../../github/dataFetcher';
import githubQueries from '../../../github/queries';
import getOldestDate from '../../../utils';

import 'dotenv/config';
import config from '../../../config';

const nonValidUsers = ['gitter-badger'];

/**
 * @class A variant of Set, which the difference is on the equality condition of objects
 */
export class ContributorSet {
  constructor() {
    this.map = new Map();
    this[Symbol.iterator] = this.values;
  }

  add(item) {
    this.map.set(item.login, item);
  }

  values() {
    return this.map.values();
  }

  delete(item) {
    return this.map.delete(item.login);
  }
}

const isValidContributor = contributor =>
  !nonValidUsers.includes(contributor.login);

/**
 * Process the repositories array to leave only the information the schema needs.
 * @param {Array} repositories
 * @return processed repositories array
 */
const processContributors = repositories => {
  const contributors = new ContributorSet();

  repositories.forEach(repository => {
    const validContributors = repository.mentionableUsers.nodes.filter(
      isValidContributor
    );
    validContributors.forEach(githubContributor => {
      const contributor = Object.assign({}, githubContributor);
      const {
        totalPullRequestContributions: totalPullRequests,
        totalIssueContributions: totalIssues,
        totalCommitContributions: totalCommits,
      } = contributor.contributionsCollection;

      contributor.totalPullRequests = totalPullRequests;
      contributor.totalIssues = totalIssues;
      contributor.totalCommits = totalCommits;

      contributors.add(contributor);
    });
  });

  return Array.from(contributors.values());
};

/**
 * Process the user object and returns the Date of the first contribution or undefined
 * if the user has no contributions.
 * @param {Object} user
 * @return {Date} first contribution date
 */
const processFirstContributionDate = user => {
  let result;
  if (user) {
    const issuesNodes = user.contributionsCollection.issueContributions.nodes;
    const pullRequestsNodes =
      user.contributionsCollection.pullRequestContributions.nodes;
    const reviewsNodes =
      user.contributionsCollection.pullRequestReviewContributions.nodes;
    const contributions = [
      ...issuesNodes,
      ...pullRequestsNodes,
      ...reviewsNodes,
    ];

    const dates = [];
    contributions.forEach(contribution => {
      const firstContrib = contribution.occurredAt;
      dates.push(new Date(firstContrib));
    });

    if (dates.length > 0) result = getOldestDate(dates);
  }

  return result;
};

const firstContributionDateResolver = async (parent, args, { token }) => {
  const { login } = args;
  const body = githubQueries.firstContributionDate(login, parent.id);
  const data = await fetchData(body, token);

  const result = processFirstContributionDate(data.data.user);
  return result;
};

const validateLogin = async (login, orgID, token) => {
  const body = githubQueries.isContributor(login, orgID);
  const data = await fetchData(body, token);
  const { user } = data.data;
  const isValid = user && user.contributionsCollection.hasAnyContributions;
  return isValid;
};

export default {
  Query: {
    contributors: async (parent, args, { token }) => {
      const { first } = args;

      const repoArgs = { first: parent.totalRepos };
      const userArgs = { first };

      const body = githubQueries.contributors(parent, repoArgs, userArgs);
      const data = await fetchData(body, token);

      const contributorsArray = processContributors(
        data.data.organization.repositories.nodes
      );
      contributorsArray.length = first;
      return contributorsArray;
    },
    contributor: async (parent, args, { token }, info) => {
      const { login } = args;
      const { id } = parent;
      const isValidLogin = await validateLogin(login, id, token);

      if (!isValidLogin) {
        throw new Error(
          `User ${login} may not be a GitHub User or a Contributor.`
        );
      }
      const body = githubQueries.contributor(login, id);
      const data = await fetchData(body, token);
      const contributor = data.data.user;

      const {
        totalPullRequestContributions: totalPullRequests,
        totalIssueContributions: totalIssues,
        totalCommitContributions: totalCommits,
      } = contributor.contributionsCollection;

      contributor.totalPullRequests = totalPullRequests;
      contributor.totalIssues = totalIssues;
      contributor.totalCommits = totalCommits;

      // Get the query's fields
      const { fieldNodes } = info;
      const rootFields = fieldNodes
        .filter(node => node.name.value === 'contributor')
        .pop();
      const fields = rootFields.selectionSet.selections.map(
        node => node.name.value
      );

      /*
      Because the field 'firstContributionDate' doesnt come on contributors query, we will
      only resolve it if is really necessary.
      */
      if (fields.includes('firstContributionDate')) {
        contributor.firstContributionDate = firstContributionDateResolver(
          parent,
          args,
          { token }
        );
      }

      return contributor;
    },
    openIssues: async (parent, _args, { token }) => {
      const { login } = parent;

      const body = githubQueries.contributorTotalIssuesOpen(
        login,
        config.github.organization
      );
      const data = await fetchData(body, token);
      const totalOpenIssues = data.data.search.issueCount;

      return totalOpenIssues;
    },
    closedIssues: async (parent, _args, { token }) => {
      const { login } = parent;

      const body = githubQueries.contributorTotalIssuesClosed(
        login,
        config.github.organization
      );
      const data = await fetchData(body, token);
      const totalClosedIssues = data.data.search.issueCount;

      return totalClosedIssues;
    },
    openPullRequests: async (parent, _args, { token }) => {
      const { login } = parent;

      const body = githubQueries.contributorTotalPullRequestsOpen(
        login,
        config.github.organization
      );
      const data = await fetchData(body, token);
      const totalOpenIssues = data.data.search.issueCount;

      return totalOpenIssues;
    },
    closedPullRequests: async (parent, _args, { token }) => {
      const { login } = parent;

      const body = githubQueries.contributorTotalPullRequestsClosed(
        login,
        config.github.organization
      );
      const data = await fetchData(body, token);
      const totalClosedIssues = data.data.search.issueCount;

      return totalClosedIssues;
    },
  },
};
