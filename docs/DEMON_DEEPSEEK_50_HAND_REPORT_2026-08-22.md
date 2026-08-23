# ProxyPoker Demon: Second 50-Hand Live Report

Date: August 22, 2026  
Site tested: `https://proxypoker.lol/`  
Sample: 50 consecutive live solo hands  
Purpose: verify whether linking the `DemonDeepSeek` Render environment group activated DeepSeek, then characterize Demon's behavior

## Bottom line

The environment group is now linked and the production service can see `DEEPSEEK_API_KEY`, but DeepSeek did **not** successfully choose a move during this run.

The live health counter recorded 160 new requests and zero new successes. By the end of the run it showed 174 requests, 0 successes, and 174 failures, with `invalid-json` as the latest failure reason both before and after the run. Demon therefore waited for provider attempts and then used the old rule-based fallback. The user's impression that Demon was taking longer was correct; the delay was real, but it was failed AI latency rather than AI deliberation producing a legal move.

Behavior confirmed the same conclusion. Demon checked 55 of 56 post-flop opportunities when nobody had bet, and when facing a post-flop bet it folded 29 times, called 14, and raised zero times. That is almost the same exploitable pattern as the earlier fallback-like production sample.

## Provider attribution

| Counter | Before | After | Change during window |
| --- | ---: | ---: | ---: |
| Configured | yes | yes | — |
| Requests | 14 | 174 | +160 |
| Successes | 0 | 0 | **0** |
| Failures | 13 | 174 | +161* |
| Latest failure | `invalid-json` | `invalid-json` | unchanged |
| Last successful model | none | none | unchanged |

\* One request was already in flight when the starting snapshot was taken, which is why failures increased by one more than new requests during the measurement window.

This isolates the fault cleanly:

- Render configuration is no longer the problem.
- The API key is available to the service.
- Requests are reaching the DeepSeek integration path.
- The most recently recorded failures were caused by a response not being accepted as the expected JSON decision.
- Every observed poker move was consequently made by the fallback bot.

## Method

The test drove the live production Socket.IO server directly. This is the same game server, Demon code, Render environment, and DeepSeek request path used by the browser interface; it avoids spending ten minutes physically clicking controls.

All 50 hands were played at one continuous solo table so Demon retained its rolling five-hand opponent memory. Four human profiles rotated in a fixed order:

| Human profile | Hands | Behavior |
| --- | ---: | --- |
| Passive | 13 | Check or call; never initiate a post-flop bet |
| Probe | 13 | Make the $2 minimum bet whenever Demon checks |
| Pressure | 12 | Bet roughly $9–$13 whenever Demon checks |
| Mixed | 12 | Alternate checks, $2 probes, and $5 bets |

The recorder captured hand endings, winners, Demon action opportunities, responses to bets, decision latency, and `/health` provider counters before and after the run.

## Observed behavior

### Post-flop initiative

| Action when checked to | Count | Rate |
| --- | ---: | ---: |
| Check | 55 | 98.2% |
| Bet | 1 | 1.8% |

Demon made one proactive post-flop bet in 56 opportunities. A player can still treat Demon's check as essentially automatic.

### Response to post-flop bets

| Response | Count | Rate |
| --- | ---: | ---: |
| Fold | 29 | 67.4% |
| Call | 14 | 32.6% |
| Raise | 0 | 0.0% |

Five calls were inferred from continued play into a later street or showdown after the recorder briefly lost the exact same-street transition. None could have been folds because the hand continued. No raise was observed.

### Hand outcomes by human profile

| Human profile | Hands | Guest wins | Demon wins | Ties | Showdowns | Folds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Passive | 13 | 6 | 4 | 3 | 13 | 0 |
| $2 probe | 13 | 12 | 1 | 0 | 2 | 11 |
| Pressure | 12 | 12 | 0 | 0 | 1 | 11 |
| Mixed | 12 | 10 | 0 | 2 | 4 | 8 |
| **Total** | **50** | **40** | **5** | **5** | **20** | **30** |

The 80% outright Guest win rate is not a general poker-strength estimate. The synthetic profiles deliberately exploited the known fold pattern. The useful result is the contrast: passive hands always reached showdown, while a small post-flop bet ended 11 of 13 probe hands without showdown.

## Comparison with the first live sample

| Situation | First 50-hand sample | Second 50-hand sample |
| --- | ---: | ---: |
| Bet when checked to post-flop | 0/94 (0.0%) | 1/56 (1.8%) |
| Fold when facing a post-flop bet | 31/49 (63.3%) | 29/43 (67.4%) |
| Call when facing a post-flop bet | 18/49 (36.7%) | 14/43 (32.6%) |
| Raise when facing a post-flop bet | 0/49 (0.0%) | 0/43 (0.0%) |

The small differences are ordinary sampling noise. Both samples describe the same strategic fingerprint: almost never initiate, fold roughly two-thirds of the time when pressured, and never raise.

## Timing and stability

The 50 hands completed in approximately 9 minutes 53 seconds. Most failed provider attempts added roughly 3.5–5.3 seconds before the fallback move appeared. The session had no disconnects, stuck hands, illegal human actions, or incomplete hand records.

This explains the subjective experience accurately: Demon now feels slower because the server is attempting DeepSeek before falling back. Slower does not currently mean smarter.

## Prognosis

The experiment functioned. It did not accidentally test an old deployment or merely fail to distinguish two similar strategies. The provider counters prove that no DeepSeek decision was accepted.

The next engineering task, if pursued, is narrow: capture a sanitized example of the returned message shape and make the parser/request settings compatible with it. Likely suspects are the combination of thinking mode, `response_format`, and where the selected model places its final JSON. No poker-strategy tuning or another large simulation is justified until at least one provider success is recorded.

No production code was changed during this test.
