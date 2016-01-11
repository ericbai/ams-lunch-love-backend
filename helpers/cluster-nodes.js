'use strict';

const User = require('../models/user'),
	db = require('../db'),
	RSVP = require('rsvp'),
	SortedSet = require('collections/sorted-set'),
	CMap = require('collections/map'),
	CSet = require('collections/set');;

module.exports = function(clusterSize, overlapTolerance, ...candidateEmails) {
	return new RSVP.Promise((resolve, reject) => {
		if (candidateEmails.length < clusterSize) {
			return reject({
				message: `Must specify at least ${clusterSize} (the size of a cluster) to try to cluster`
			});
		}
		User.existsForEmails(...candidateEmails).then(() => {
			return RSVP.hash({
				emailToAlreadyMet: buildEmailToAlreadyMet(...candidateEmails),
				sortedEmailsAndNumGroups: buildSortedEmailToNumGroups(...candidateEmails)
			});
		}).then((dbData) => {
			try {
				const emailToAlreadyMet = dbData.emailToAlreadyMet,
					sortedEmailsAndNumGroups = dbData.sortedEmailsAndNumGroups,
					alreadyClusteredEmails = new CSet(),
					clusters = [];
				// start with least-connected user
				let nextCluster = initializeNextCluster(sortedEmailsAndNumGroups, alreadyClusteredEmails),
					memberToNumOverlaps = initializeMemberToNumOverlaps(nextCluster[0], emailToAlreadyMet),
					overlapSoFar = 0;
				while (nextCluster) {
					const result = findNodeToAdd(overlapSoFar, overlapTolerance, alreadyClusteredEmails, sortedEmailsAndNumGroups, memberToNumOverlaps);
					if (result.found) {
						overlapSoFar = result.overlapSoFar;
						nextCluster = addNodeToCluster(result.nodeToAdd, nextCluster, emailToAlreadyMet, alreadyClusteredEmails, memberToNumOverlaps)
						if (nextCluster.length === clusterSize) {
							clusters.push(nextCluster);
							//initialize the next cluster
							nextCluster = initializeNextCluster(sortedEmailsAndNumGroups, alreadyClusteredEmails);
							if (nextCluster) {
								memberToNumOverlaps = initializeMemberToNumOverlaps(nextCluster[0], emailToAlreadyMet);
							}
						}
					} else {
						//if no more users left to add, keep this cluster
						if (sortedEmailsAndNumGroups.length === 0 && nextCluster.length > 1) {
							clusters.push(nextCluster);
						} else { //else add the users from this cluster back 
							nextCluster.forEach((node) => {
								alreadyClusteredEmails.remove(node.email);
							});
						}
						nextCluster = null;
					}
				}
				const notGrouped = [];
				sortedEmailsAndNumGroups.forEach((node) => {
					if (!alreadyClusteredEmails.has(node.email)) {
						notGrouped.push(node.email);
					}
				});
				resolve({
					groups: clusters.map((cluster) => {
						return cluster.map((node) => {
							return node.email;
						});
					}),
					meta: {
						overlap: overlapSoFar,
						notGrouped: notGrouped
					}
				});
			} catch (e) {
				reject({
					message: e.message
				});
			}
		}).catch(reject);
	});
}

////////////////////
// Helper methods //
////////////////////

function buildEmailToAlreadyMet(...candidateEmails) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (u:User)-[:CONTAINS*2]-(o:User)
			WHERE u.email IN {emails}
			RETURN u.email, collect(o.email)`, {
			emails: candidateEmails
		}, (err, results) => {
			if (err) return reject(err);
			resolve(results.data.reduce((accum, el) => {
				accum.set(el[0], el[1]);
				return accum;
			}, new CMap()));
		});
	});
}

function buildSortedEmailToNumGroups(...candidateEmails) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (u:User)-[:CONTAINS]-(g:Group)
			WHERE u.email IN {emails}
			RETURN u.email, count(g)`, {
			emails: candidateEmails
		}, (err, results) => {
			if (err) return reject(err);
			const equalsFunc = (obj1, obj2) => {
					return obj1.email === obj2.email;
				},
				compareFunc = (obj1, obj2) => {
					//if same numGroups, always rotate right
					return (obj1.numGroups > obj2.numGroups) ? 1 : -1;
				},
				sortedEmailToNumGroups = results.data.reduce((accum, el) => {
					accum.push({
						email: el[0],
						numGroups: el[1]
					});
					return accum;
				}, new SortedSet(null, equalsFunc, compareFunc)),
				emailsAdded = new CSet(results.data.map((el) => {
					return el[0];
				}));
			//add the ones not found as with 0 number of groups
			candidateEmails.forEach((candidateEmail) => {
				if (!emailsAdded.contains(candidateEmail)) {
					sortedEmailToNumGroups.push({
						email: candidateEmail,
						numGroups: 0
					});
				}
			});
			resolve(sortedEmailToNumGroups);
		});
	});
}

function initializeNextCluster(sortedEmailsAndNumGroups, alreadyClusteredEmails) {
	const possibleNextStartingNodes = sortedEmailsAndNumGroups.filter((node) => {
		return !alreadyClusteredEmails.has(node.email);
	});
	if (possibleNextStartingNodes.length === 0) {
		return null;
	} else {
		const nextStartingNode = possibleNextStartingNodes.shift();
		alreadyClusteredEmails.add(nextStartingNode.email);
		return [nextStartingNode];
	}
}

function initializeMemberToNumOverlaps(firstNodeInCluster, emailToAlreadyMet) {
	if (!firstNodeInCluster) return null;
	const memberToNumOverlaps = new CMap();
	if (emailToAlreadyMet.has(firstNodeInCluster.email)) {
		emailToAlreadyMet.get(firstNodeInCluster.email).forEach((alreadyMet) => {
			memberToNumOverlaps.set(alreadyMet, 1);
		});
	}
	return memberToNumOverlaps;
}

function findNodeToAdd(overlapSoFar, overlapTolerance, alreadyClusteredEmails, sortedEmailsAndNumGroups, memberToNumOverlaps) {
	const overlapLeft = overlapTolerance - overlapSoFar,
		possibleNodesToAdd = sortedEmailsAndNumGroups.filter((node) => {
			return !alreadyClusteredEmails.has(node.email) && (!memberToNumOverlaps.has(node.email) || memberToNumOverlaps.get(node.email) <= overlapLeft);
		});
	if (possibleNodesToAdd.length === 0) {
		return {
			found: false
		};
	} else {
		const nodeToAdd = possibleNodesToAdd.shift(),
			additionalOverlap = memberToNumOverlaps.has(nodeToAdd.email) ? memberToNumOverlaps.get(nodeToAdd.email) : 0;
		return {
			found: true,
			nodeToAdd: nodeToAdd,
			overlapSoFar: overlapSoFar + additionalOverlap
		};
	}
}

function addNodeToCluster(nodeToAdd, cluster, emailToAlreadyMet, alreadyClusteredEmails, memberToNumOverlaps) {
	cluster.push(nodeToAdd);
	alreadyClusteredEmails.add(nodeToAdd.email)
	if (emailToAlreadyMet.has(nodeToAdd.email)) {
		emailToAlreadyMet.get(nodeToAdd.email).forEach((alreadyMet) => {
			if (memberToNumOverlaps.has(alreadyMet)) {
				memberToNumOverlaps.set(memberToNumOverlaps.get(alreadyMet) + 1)
			} else {
				memberToNumOverlaps.set(alreadyMet, 1);
			}
		});
	}
	return cluster;
}