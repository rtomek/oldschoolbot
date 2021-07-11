import { MessageAttachment } from 'discord.js';
import { randInt } from 'e';
import { CommandStore, KlasaMessage, Stopwatch } from 'klasa';
import { Bank, Items } from 'oldschooljs';

import { BotCommand } from '../lib/structures/BotCommand';

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			usage: '<amount:int{1,5000}>'
		});
	}

	async run(msg: KlasaMessage, [num]: [number]) {
		const stopwatch = new Stopwatch();
		let results: string[] = [];
		const testBank = new Bank();
		for (const i of Items.random(num)) {
			testBank.add(i.id, randInt(1, 100));
		}

		let image = null;
		for (let i = 0; i < 10; i++) {
			const t = new Stopwatch();
			const res = await this.client.tasks
				.get('bankImage')!
				.generateBankImage(testBank.bank, `${num} Test Items`, true, { [randInt(1, 10_000)]: '1' });
			results.push(t.stop().toString());
			if (!image) image = res.image!;
		}

		const timings = results.map((t, index) => `${index + 1}. ${t}`).join('\n');
		const content = `Finished in ${stopwatch.stop()}
${timings}`;

		return msg.channel.send({
			files: [new MessageAttachment(image!, 'test.png')],
			content
		});
	}
}
