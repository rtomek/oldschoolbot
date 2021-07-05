import { MessageActionRow, MessageButton } from 'discord.js';
import { KlasaMessage } from 'klasa';

import { BotCommand } from '../lib/structures/BotCommand';

export default class extends BotCommand {
	async run(msg: KlasaMessage) {
		return msg.channel.send({
			content: 'Pick an item',
			components: [
				new MessageActionRow().addComponents(
					new MessageButton().setCustomID('button_test').setLabel('Test').setStyle('SECONDARY')
				)
			]
		});
	}
}
