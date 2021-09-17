import { calcPercentOfNum, randInt, sumArr, Time } from 'e';
import { CommandStore, KlasaMessage, KlasaUser } from 'klasa';
import { Bank } from 'oldschooljs';
import { TzKalZuk } from 'oldschooljs/dist/simulation/monsters/special/TzKalZuk';

import { Activity } from '../../lib/constants';
import fightCavesSupplies from '../../lib/minions/data/fightCavesSupplies';
import { minionNotBusy, requiresMinion } from '../../lib/minions/decorators';
import { ClientSettings } from '../../lib/settings/types/ClientSettings';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import { SkillsEnum } from '../../lib/skilling/types';
import { BotCommand } from '../../lib/structures/BotCommand';
import { PercentCounter } from '../../lib/structures/PercentCounter';
import { InfernoOptions } from '../../lib/types/minions';
import { formatDuration, percentChance, updateBankSetting } from '../../lib/util';
import addSubTaskToActivityTask from '../../lib/util/addSubTaskToActivityTask';
import chatHeadImage from '../../lib/util/chatHeadImage';
import getOSItem from '../../lib/util/getOSItem';

const minimumRangeItems = [
	'Amulet of fury',
	"Ancient d'hide body",
	'Ancient chaps',
	'Dragon crossbow',
	'Barrows gloves',
	"Ava's assembler",
	'Snakeskin boots'
].map(getOSItem);

export const minimumRangeAttackStat = sumArr(minimumRangeItems.map(i => i.equipment!.attack_ranged));

const minimumMageItems = [
	'Amulet of fury',
	'Saradomin cape',
	"Ahrim's robetop",
	"Ahrim's robeskirt",
	'Barrows gloves',
	'Splitbark boots',
	'Ancient staff'
].map(getOSItem);

export const minimumMageAttackStat = sumArr(minimumMageItems.map(i => i.equipment!.attack_magic));

// const startMessages = [
// 	"You're on your own now JalYt, you face certain death... prepare to fight for your life.",
// 	'You will certainly die, JalYt, good luck.',
// 	'Many think they are strong enough to defeat TzKal-Zuk, many are wrong... good luck JalYt.'
// ];

function gearCheck(user: KlasaUser): true | string {
	const rangeGear = user.getGear('range');
	const mageGear = user.getGear('mage');

	if (!rangeGear.equippedWeapon() || !mageGear.equippedWeapon()) {
		return "You aren't wearing a weapon in your range/mage setup.";
	}

	if (rangeGear.stats.attack_ranged < minimumRangeAttackStat) {
		return `Your range setup needs a minimum of ${minimumRangeAttackStat} ranged attack. Try equipping some of these items: ${minimumRangeItems
			.map(i => i.name)
			.join(', ')}.`;
	}

	if (mageGear.stats.attack_magic < minimumMageAttackStat) {
		return `Your range setup needs a minimum of ${minimumMageAttackStat} mage attack. Try equipping some of these items: ${minimumMageItems
			.map(i => i.name)
			.join(', ')}.`;
	}

	return true;
}

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			oneAtTime: true,
			altProtection: true,
			requiredPermissions: ['ATTACH_FILES'],
			description:
				'Sends your minion to complete the fight caves - it will start off bad but get better with more attempts. Requires range gear, prayer pots, brews and restores.',
			examples: ['+inferno'],
			categoryFlags: ['minion', 'minigame']
		});
	}

	basePreZukDeathChance(user: KlasaUser) {
		const attempts = user.settings.get(UserSettings.Stats.InfernoAttempts);
		let deathChance = Math.max(14 - attempts * 2, 5);

		return deathChance;
	}

	baseZukDeathChance(user: KlasaUser) {
		const attempts = user.settings.get(UserSettings.Stats.InfernoAttempts);
		const chance = Math.floor(100 - (Math.log(attempts) / Math.log(Math.sqrt(15))) * 50);

		return Math.max(Math.min(chance, 99), 5);
	}

	@minionNotBusy
	@requiresMinion
	async run(msg: KlasaMessage) {
		await msg.author.settings.sync(true);
		const gearOkay = gearCheck(msg.author);
		if (typeof gearOkay === 'string') {
			return msg.channel.send(gearOkay);
		}

		const attempts = msg.author.settings.get(UserSettings.Stats.InfernoAttempts);
		const usersRangeStats = msg.author.getGear('range').stats;
		const zukKC = msg.author.getKC(TzKalZuk.id);

		const duration = new PercentCounter(Time.Hour * 3);
		const zukDeathChance = new PercentCounter(this.baseZukDeathChance(msg.author));
		const preZukDeathChance = new PercentCounter(this.basePreZukDeathChance(msg.author));

		const userBank = msg.author.bank();
		const cost = new Bank();

		/** *
		 *
		 *
		 * Consumables / Cost
		 *
		 */
		/**
		 * Players with over 100 Zuk KC and 99 Agility don't need a Stamina potion.
		 */
		if (zukKC < 100 && msg.author.skillLevel(SkillsEnum.Agility) === 99) {
			if (userBank.has('Stamina potion(4)')) {
				cost.add('Stamina potion(4)');
			} else {
				duration.add(-10, 'no Stam');
				zukDeathChance.add(30, 'no Stam');
			}
		}

		const fakeDuration = duration.value;

		const diedPreZuk = percentChance(preZukDeathChance.value);
		const diedZuk = percentChance(zukDeathChance.value);
		let deathTime: number | null = null;
		if (diedPreZuk) {
			deathTime = randInt(Time.Minute, calcPercentOfNum(90, duration.value));
		} else if (diedZuk) {
			deathTime = randInt(calcPercentOfNum(90, duration.value), duration.value);
		}

		await addSubTaskToActivityTask<InfernoOptions>({
			userID: msg.author.id,
			channelID: msg.channel.id,
			duration: deathTime ?? duration.value,
			type: Activity.Inferno,
			zukDeathChance: zukDeathChance.value,
			preZukDeathChance: preZukDeathChance.value,
			deathTime,
			fakeDuration,
			diedPreZuk,
			diedZuk
		});

		updateBankSetting(this.client, ClientSettings.EconomyStats.InfernoCost, fightCavesSupplies);

		return msg.channel.send({
			content: `**Duration:** ${formatDuration(duration.value)} (${(duration.value / 1000 / 60).toFixed(
				2
			)} minutes)
**Boosts:** ${duration.messages.join(', ')}
**Range Attack Bonus:** ${usersRangeStats.attack_ranged}
**Zuk KC:** ${zukKC}
**Attempts:** ${attempts}
**Pre-Zuk Death Chance:** ${preZukDeathChance.value}% ${preZukDeathChance.messages.join(', ')}
**Zuk Death Chance:** ${zukDeathChance.value}% ${zukDeathChance.messages.join(', ')}

**Removed from your bank:** ${new Bank(fightCavesSupplies)}`,
			files: [
				await chatHeadImage({
					content: "You're on your own now JalYt, you face certain death... prepare to fight for your life.",
					head: 'ketKeh'
				})
			]
		});
	}
}

// if (isOnTask && msg.author.hasItemEquippedOrInBank('Black mask (i)')) {
// 		duration *= 0.85;
// 		debugStr += ', 15% on Task with Black mask (i)';
// 	}

// const usersTask = await getUsersCurrentSlayerInfo(msg.author.id);
// const isOnTask =
// 	usersTask.currentTask !== null &&
// 	usersTask.currentTask!.monsterID === Monsters.TzKalZuk.id &&
// 	usersTask.currentTask!.quantityRemaining === usersTask.currentTask!.quantity;
// determineDuration(user: KlasaUser): [number, string] {
// 	let baseTime = Time.Hour * 2;
// 	const gear = user.getGear('range');
// 	let debugStr = '';

// 	// Reduce time based on KC
// 	const kc = user.getKC(TzKalZuk.id);
// 	const percentIncreaseFromKC = Math.min(50, kc);
// 	baseTime = reduceNumByPercent(baseTime, percentIncreaseFromKC);
// 	debugStr += `${percentIncreaseFromKC}% from KC`;

// 	// Reduce time based on Gear
// 	const usersRangeStats = gear.stats;
// 	const percentIncreaseFromRangeStats =
// 		Math.floor(calcWhatPercent(usersRangeStats.attack_ranged, maxOffenceStats.attack_ranged)) / 2;
// 	baseTime = reduceNumByPercent(baseTime, percentIncreaseFromRangeStats);

// 	if (user.hasItemEquippedOrInBank('Twisted bow')) {
// 		debugStr += ', 15% from Twisted bow';
// 		baseTime = reduceNumByPercent(baseTime, 15);
// 	}

// 	debugStr += `, ${percentIncreaseFromRangeStats}% from Gear`;

// 	return [baseTime, debugStr];
// }
