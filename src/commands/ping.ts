import type { CommandInteraction } from "dressed";
 
// The function name can be whatever you want
// Technically you don't even need to specify the name
export default function pingCommand(interaction: CommandInteraction) {
  interaction.reply("Pong!"); // This will send a simple message back to the user
}