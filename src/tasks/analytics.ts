import { Time } from 'e';
import { Task } from 'klasa';
import { MoreThan } from 'typeorm';

import { ActivityGroup } from '../lib/constants';
import { ClientSettings } from '../lib/settings/types/ClientSettings';
import { ActivityTable } from '../lib/typeorm/ActivityTable.entity';
import { AnalyticsTable } from '../lib/typeorm/AnalyticsTable.entity';
import { GroupMonsterActivityTaskOptions } from '../lib/types/minions';
import { taskGroupFromActivity } from '../lib/util/taskGroupFromActivity';

export default class extends Task {
	async init() {
		if (this.client.analyticsInterval) {
			clearInterval(this.client.analyticsInterval);
		}
		this.client.analyticsInterval = setInterval(this.analyticsTick.bind(this), Time.Minute * 5);
	}

	async run() {
		this.analyticsTick();
	}

	async calculateMinionTaskCounts() {
		const minionTaskCounts: Record<ActivityGroup, number> = {
			[ActivityGroup.Clue]: 0,
			[ActivityGroup.Minigame]: 0,
			[ActivityGroup.Monster]: 0,
			[ActivityGroup.Skilling]: 0
		};

		const currentTasks = await ActivityTable.find({
			where: {
				completed: false,
				finishDate: MoreThan('now()')
			}
		});

		for (const task of currentTasks) {
			const group = taskGroupFromActivity(task.type);

			if (task.groupActivity) {
				minionTaskCounts[group] += (task.data as GroupMonsterActivityTaskOptions).users.length;
			} else {
				minionTaskCounts[group] += 1;
			}
		}
		return minionTaskCounts;
	}

	async analyticsTick() {
		const [numberOfMinions, totalSacrificed, numberOfIronmen, totalGP] = (
			await Promise.all(
				[
					'SELECT COUNT(*) FROM users WHERE "minion.hasBought" = true;',
					'SELECT SUM ("sacrificedValue") AS count FROM users;',
					'SELECT COUNT(*) FROM users WHERE "minion.ironman" = true;',
					'SELECT SUM ("GP") AS count FROM users;'
				].map(query => this.client.query(query))
			)
		).map((result: any) => parseInt(result[0].count)) as number[];

		const taskCounts = await this.calculateMinionTaskCounts();

		await AnalyticsTable.insert({
			guildsCount: this.client.guilds.cache.size,
			membersCount: this.client.guilds.cache.reduce((acc, curr) => (acc += curr.memberCount), 0),
			timestamp: Math.floor(Date.now() / 1000),
			clueTasksCount: taskCounts.Clue,
			minigameTasksCount: taskCounts.Minigame,
			monsterTasksCount: taskCounts.Monster,
			skillingTasksCount: taskCounts.Skilling,
			ironMinionsCount: numberOfIronmen,
			minionsCount: numberOfMinions,
			totalSacrificed,
			totalGP,
			dicingBank: this.client.settings.get(ClientSettings.EconomyStats.DicingBank),
			duelTaxBank: this.client.settings.get(ClientSettings.EconomyStats.DuelTaxBank),
			dailiesAmount: this.client.settings.get(ClientSettings.EconomyStats.DailiesAmount),
			gpAlching: this.client.settings.get(ClientSettings.EconomyStats.GPSourceAlching),
			gpPvm: this.client.settings.get(ClientSettings.EconomyStats.GPSourcePVMLoot),
			gpSellingItems: this.client.settings.get(ClientSettings.EconomyStats.GPSourceSellingItems),
			gpPickpocket: this.client.settings.get(ClientSettings.EconomyStats.GPSourcePickpocket),
			gpOpen: this.client.settings.get(ClientSettings.EconomyStats.GPSourceOpen),
			gpDice: this.client.settings.get(ClientSettings.EconomyStats.GPSourceDice),
			gpDaily: this.client.settings.get(ClientSettings.EconomyStats.GPSourceDaily)
		});
	}
}
