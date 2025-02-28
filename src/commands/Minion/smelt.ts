import { Time } from 'e';
import { CommandStore, KlasaMessage } from 'klasa';
import { Bank } from 'oldschooljs';

import { Activity } from '../../lib/constants';
import { minionNotBusy, requiresMinion } from '../../lib/minions/decorators';
import { ClientSettings } from '../../lib/settings/types/ClientSettings';
import Smithing from '../../lib/skilling/skills/smithing';
import { SkillsEnum } from '../../lib/skilling/types';
import { BotCommand } from '../../lib/structures/BotCommand';
import { SmeltingActivityTaskOptions } from '../../lib/types/minions';
import { formatDuration, itemID, stringMatches, updateBankSetting } from '../../lib/util';
import addSubTaskToActivityTask from '../../lib/util/addSubTaskToActivityTask';

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			altProtection: true,
			oneAtTime: true,
			cooldown: 1,
			usage: '<quantity:int{1}|name:...string> [name:...string]',
			usageDelim: ' ',
			categoryFlags: ['minion', 'skilling'],
			description: 'Sends your minion to smelt items, which is turning ores into bars.',
			examples: ['+smelt bronze']
		});
	}

	@requiresMinion
	@minionNotBusy
	async run(msg: KlasaMessage, [quantity, barName = '']: [null | number | string, string]) {
		if (typeof quantity === 'string') {
			barName = quantity;
			quantity = null;
		}

		const bar = Smithing.Bars.find(
			bar => stringMatches(bar.name, barName) || stringMatches(bar.name.split(' ')[0], barName)
		);

		if (!bar) {
			return msg.channel.send(
				`Thats not a valid bar to smelt. Valid bars are ${Smithing.Bars.map(bar => bar.name).join(', ')}.`
			);
		}

		if (msg.author.skillLevel(SkillsEnum.Smithing) < bar.level) {
			return msg.channel.send(`${msg.author.minionName} needs ${bar.level} Smithing to smelt ${bar.name}s.`);
		}

		// All bars take 2.4s to smith, add on quarter of a second to account for banking/etc.
		const timeToSmithSingleBar = Time.Second * 2.4 + Time.Second / 4;

		const maxTripLength = msg.author.maxTripLength(Activity.Smithing);

		// If no quantity provided, set it to the max.
		if (quantity === null) {
			quantity = Math.floor(maxTripLength / timeToSmithSingleBar);
		}

		const baseCost = new Bank(bar.inputOres);

		const maxCanDo = msg.author.bank().fits(baseCost);
		if (maxCanDo === 0) {
			return msg.channel.send("You don't have enough supplies to smelt even one of this item!");
		}
		if (maxCanDo < quantity) {
			quantity = maxCanDo;
		}

		const cost = new Bank();
		cost.add(baseCost.multiply(quantity));

		const duration = quantity * timeToSmithSingleBar;
		if (duration > maxTripLength) {
			return msg.channel.send(
				`${msg.author.minionName} can't go on trips longer than ${formatDuration(
					maxTripLength
				)}, try a lower quantity. The highest amount of ${bar.name}s you can smelt is ${Math.floor(
					maxTripLength / timeToSmithSingleBar
				)}.`
			);
		}

		await msg.author.removeItemsFromBank(cost);
		updateBankSetting(this.client, ClientSettings.EconomyStats.SmithingCost, cost);

		await addSubTaskToActivityTask<SmeltingActivityTaskOptions>({
			barID: bar.id,
			userID: msg.author.id,
			channelID: msg.channel.id,
			quantity,
			duration,
			type: Activity.Smelting
		});

		let goldGauntletMessage = '';
		if (bar.id === itemID('Gold bar') && msg.author.hasItemEquippedAnywhere('Goldsmith gauntlets')) {
			goldGauntletMessage = '\n\n**Boosts:** 56.2 xp per gold bar for Goldsmith gauntlets.';
		}

		return msg.channel.send(
			`${msg.author.minionName} is now smelting ${quantity}x ${bar.name}, it'll take around ${formatDuration(
				duration
			)} to finish.${goldGauntletMessage}`
		);
	}
}
