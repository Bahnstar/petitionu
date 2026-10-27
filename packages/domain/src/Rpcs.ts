import { RpcGroup } from "effect/rpc"
import { AccountsRpcs } from "./Accounts.ts"
import { SupportRpcs } from "./Support.ts"
import { UsersRpcs } from "./Users.ts"

/**
 * Composition point for the RPC API: every procedure the browser can call over `POST /rpc`.
 * Each feature area defines its own group in its own module and merges it here with one line,
 * e.g. `.merge(PetitionRpcs)`.
 */
export class AppRpcs extends RpcGroup.make()
  .merge(AccountsRpcs)
  .merge(UsersRpcs)
  .merge(SupportRpcs) {}
