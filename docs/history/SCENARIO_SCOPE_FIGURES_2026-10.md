# Scenario scope: sample figures moved by PR #208 and by its follow-up (October 2026)

PR #208 ("What else moves + Advanced reasoning: use the business's confirmed scenarios and its own settings") said the sample businesses were unchanged. They were not. #208 passed the profile's risk settings (cameras, daily cash, bonding, alarm) into the portfolio residual that What else moves and Advanced reasoning print, so several levers now lower the sample's average residual risk and its critical-path count where before they moved neither. This page lists every sample figure and sentence that moved, before and after.

The follow-up change (review findings PR208-1 to PR208-6) makes Advanced reasoning and Pioneer price only scenarios in scope:

- The beam search behind "Suggested order" prices the same scenario the side-by-side comparison does: the most dangerous scenario in scope. When an own business has confirmed no scenario, no scenario is priced and the levers are ranked on the residual index alone. Every own business with nothing confirmed loses "Cut daily cash exposure 20%" from its suggested order (every industry: "Cameras + dual release + bank reconciliation (stack) → Cut daily cash exposure 20%" → "Cameras + dual release + bank reconciliation (stack)").
- The Advanced reasoning panel, and the summary of Pioneer's advanced reasoning tool, show the same note What else moves shows when no scenario is in scope. For an own dental business: "Sample scenarios from the dental office sample (5) stay out: their losses and timelines are the sample's assumptions, not facts about your business. To make one your own, open it on What could happen and choose "This could happen here"; it then counts in the priority list and your totals."
- Pioneer's variable cascades tool counts the confirmed scenarios, as the What else moves panel does. For an own dental business that confirmed only the vendor fraud scenario, its baseline residual moves from 51 to 57, the figure the panel shows.
- "about 1 points" reads "about 1 point".

On the samples, the follow-up moves only that last sentence. Slice S09 (commit 16b16b3, between #208 and the follow-up) moved none of the figures on this page.

## How to read the tables

The three columns are the sample business with its saved settings at three points: before #208 (main at 981e684), after #208 (main at bdfc90b), and after the follow-up (on top of S09). Each cell gives the portfolio average residual before and after the lever, the critical-path count before and after, and the lever's verdict as What else moves prints it. A lever not listed moved none of the three on that sample. When a figure moves, What else moves also lists it as a new row ("Portfolio average residual: 58 → 57", "Critical-path count: 4 → 2"). The baseline residual of every sample did not move (dental 58, retail 67, professional services 65, restaurant 65, construction 55, automotive 56, nonprofit 56, general 61). The suggested order on every sample did not move: "Cameras + dual release + bank reconciliation (stack)".

## Dental office sample (`dental`)

| Lever                                      | Before #208 (981e684)                                                | After #208 (bdfc90b)                                                                                      | After the follow-up                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Install security cameras (cash/safe/front) | 58 → 58; critical path 4 → 4; "No tradeoffs in this model."          | 58 → 57; critical path 4 → 4; "average residual risk falls 1 point. No tradeoffs in this model."          | 58 → 57; critical path 4 → 4; "average residual risk falls 1 point. No tradeoffs in this model."          |
| Bond / screen cash handlers                | 58 → 58; critical path 4 → 4; "Better overall, with some tradeoffs." | 58 → 57; critical path 4 → 4; "average residual risk falls 1 point. Better overall, with some tradeoffs." | 58 → 57; critical path 4 → 4; "average residual risk falls 1 point. Better overall, with some tradeoffs." |
| Cut daily cash exposure 20%                | 58 → 58; critical path 4 → 4; "Better overall, with some tradeoffs." | 58 → 57; critical path 4 → 2; "average residual risk falls 1 point. Better overall, with some tradeoffs." | 58 → 57; critical path 4 → 2; "average residual risk falls 1 point. Better overall, with some tradeoffs." |

Knock-on effects, before #208 → after #208 (the follow-up moves none):

- Install security cameras (cash/safe/front): "Faster detection shortens the assumed days until found, and a scheme found sooner builds up less loss." → that note, then "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Bond / screen cash handlers: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Cut daily cash exposure 20%: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."

Advanced reasoning, side-by-side comparison:

- Before #208: Switching on "Install security cameras (cash/safe/front)" lowers the cost-of-risk figure.
  - After #208: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 point and lowers the cost-of-risk figure.

## Retail / e-commerce sample (`retail`)

| Lever                                                | Before #208 (981e684)                                                                                      | After #208 (bdfc90b)                                                                                        | After the follow-up                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Install security cameras (cash/safe/front)           | 67 → 67; critical path 6 → 6; "No tradeoffs in this model."                                                | 67 → 66; critical path 6 → 6; "average residual risk falls 1 point. No tradeoffs in this model."            | 67 → 66; critical path 6 → 6; "average residual risk falls 1 point. No tradeoffs in this model."            |
| Bond / screen cash handlers                          | 67 → 67; critical path 6 → 6; "Better overall, with some tradeoffs."                                       | 67 → 66; critical path 6 → 6; "average residual risk falls 1 point. Better overall, with some tradeoffs."   | 67 → 66; critical path 6 → 6; "average residual risk falls 1 point. Better overall, with some tradeoffs."   |
| Cameras + dual release + bank reconciliation (stack) | 67 → 58; critical path 6 → 0; "average residual risk falls 9 points. Better overall, with some tradeoffs." | 67 → 57; critical path 6 → 0; "average residual risk falls 10 points. Better overall, with some tradeoffs." | 67 → 57; critical path 6 → 0; "average residual risk falls 10 points. Better overall, with some tradeoffs." |
| Cut daily cash exposure 20%                          | 67 → 67; critical path 6 → 6; "Better overall, with some tradeoffs."                                       | 67 → 65; critical path 6 → 4; "average residual risk falls 2 points. Better overall, with some tradeoffs."  | 67 → 65; critical path 6 → 4; "average residual risk falls 2 points. Better overall, with some tradeoffs."  |

Knock-on effects, before #208 → after #208 (the follow-up moves none):

- Install security cameras (cash/safe/front): "Faster detection shortens the assumed days until found, and a scheme found sooner builds up less loss." → that note, then "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Bond / screen cash handlers: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Cut daily cash exposure 20%: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."

Advanced reasoning, side-by-side comparison:

- Before #208: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 9 points and lowers the cost-of-risk figure.
  - After #208: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 10 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 10 points and lowers the cost-of-risk figure.
- Before #208: Switching on "Install security cameras (cash/safe/front)" lowers the cost-of-risk figure.
  - After #208: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 point and lowers the cost-of-risk figure.

## Professional services sample (`professional_services`)

| Lever                                                | Before #208 (981e684)                                                                                      | After #208 (bdfc90b)                                                                                       | After the follow-up                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Install security cameras (cash/safe/front)           | 65 → 65; critical path 7 → 7; "No tradeoffs in this model."                                                | 65 → 64; critical path 7 → 7; "average residual risk falls 1 point. No tradeoffs in this model."           | 65 → 64; critical path 7 → 7; "average residual risk falls 1 point. No tradeoffs in this model."           |
| Cameras + dual release + bank reconciliation (stack) | 65 → 57; critical path 7 → 0; "average residual risk falls 8 points. Better overall, with some tradeoffs." | 65 → 56; critical path 7 → 0; "average residual risk falls 9 points. Better overall, with some tradeoffs." | 65 → 56; critical path 7 → 0; "average residual risk falls 9 points. Better overall, with some tradeoffs." |
| Cut daily cash exposure 20%                          | 65 → 65; critical path 7 → 7; "Better overall, with some tradeoffs."                                       | 65 → 64; critical path 7 → 5; "average residual risk falls 1 point. Better overall, with some tradeoffs."  | 65 → 64; critical path 7 → 5; "average residual risk falls 1 point. Better overall, with some tradeoffs."  |

Knock-on effects, before #208 → after #208 (the follow-up moves none):

- Install security cameras (cash/safe/front): "Faster detection shortens the assumed days until found, and a scheme found sooner builds up less loss." → that note, then "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Cut daily cash exposure 20%: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."

Advanced reasoning, side-by-side comparison:

- Before #208: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 8 points and lowers the cost-of-risk figure.
  - After #208: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 9 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 9 points and lowers the cost-of-risk figure.
- Before #208: Switching on "Install security cameras (cash/safe/front)" lowers the cost-of-risk figure.
  - After #208: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 point and lowers the cost-of-risk figure.

## Restaurant / hospitality sample (`restaurant`)

| Lever                                                | Before #208 (981e684)                                                                                      | After #208 (bdfc90b)                                                                                        | After the follow-up                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Install security cameras (cash/safe/front)           | 65 → 65; critical path 4 → 4; "No tradeoffs in this model."                                                | 65 → 64; critical path 4 → 4; "average residual risk falls 1 point. No tradeoffs in this model."            | 65 → 64; critical path 4 → 4; "average residual risk falls 1 point. No tradeoffs in this model."            |
| Bond / screen cash handlers                          | 65 → 65; critical path 4 → 4; "Better overall, with some tradeoffs."                                       | 65 → 64; critical path 4 → 4; "average residual risk falls 1 point. Better overall, with some tradeoffs."   | 65 → 64; critical path 4 → 4; "average residual risk falls 1 point. Better overall, with some tradeoffs."   |
| Cameras + dual release + bank reconciliation (stack) | 65 → 56; critical path 4 → 0; "average residual risk falls 9 points. Better overall, with some tradeoffs." | 65 → 55; critical path 4 → 0; "average residual risk falls 10 points. Better overall, with some tradeoffs." | 65 → 55; critical path 4 → 0; "average residual risk falls 10 points. Better overall, with some tradeoffs." |
| Cut daily cash exposure 20%                          | 65 → 65; critical path 4 → 4; "Better overall, with some tradeoffs."                                       | 65 → 64; critical path 4 → 2; "average residual risk falls 1 point. Better overall, with some tradeoffs."   | 65 → 64; critical path 4 → 2; "average residual risk falls 1 point. Better overall, with some tradeoffs."   |

Knock-on effects, before #208 → after #208 (the follow-up moves none):

- Install security cameras (cash/safe/front): "Faster detection shortens the assumed days until found, and a scheme found sooner builds up less loss." → that note, then "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Bond / screen cash handlers: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Cut daily cash exposure 20%: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."

Advanced reasoning, side-by-side comparison:

- Before #208: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 9 points and lowers the cost-of-risk figure.
  - After #208: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 10 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Cameras + dual release + bank reconciliation (stack)" lowers the residual index by about 10 points and lowers the cost-of-risk figure.
- Before #208: Switching on "Install security cameras (cash/safe/front)" lowers the cost-of-risk figure.
  - After #208: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 point and lowers the cost-of-risk figure.

## Construction / trades sample (`construction`)

| Lever                                      | Before #208 (981e684)                                                | After #208 (bdfc90b)                                                                                      | After the follow-up                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Install security cameras (cash/safe/front) | 55 → 55; critical path 3 → 3; "No tradeoffs in this model."          | 55 → 55; critical path 3 → 0; "No tradeoffs in this model."                                               | 55 → 55; critical path 3 → 0; "No tradeoffs in this model."                                               |
| Bond / screen cash handlers                | 55 → 55; critical path 3 → 3; "Better overall, with some tradeoffs." | 55 → 54; critical path 3 → 0; "average residual risk falls 1 point. Better overall, with some tradeoffs." | 55 → 54; critical path 3 → 0; "average residual risk falls 1 point. Better overall, with some tradeoffs." |
| Cut daily cash exposure 20%                | 55 → 55; critical path 3 → 3; "Better overall, with some tradeoffs." | 55 → 54; critical path 3 → 0; "average residual risk falls 1 point. Better overall, with some tradeoffs." | 55 → 54; critical path 3 → 0; "average residual risk falls 1 point. Better overall, with some tradeoffs." |

Knock-on effects, before #208 → after #208 (the follow-up moves none):

- Bond / screen cash handlers: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Cut daily cash exposure 20%: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."

## Auto dealership / repair shop sample (`automotive`)

| Lever                                      | Before #208 (981e684)                                                | After #208 (bdfc90b)                                                                                       | After the follow-up                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Install security cameras (cash/safe/front) | 56 → 56; critical path 4 → 4; "No tradeoffs in this model."          | 56 → 55; critical path 4 → 0; "average residual risk falls 1 point. No tradeoffs in this model."           | 56 → 55; critical path 4 → 0; "average residual risk falls 1 point. No tradeoffs in this model."           |
| Bond / screen cash handlers                | 56 → 56; critical path 4 → 4; "Better overall, with some tradeoffs." | 56 → 55; critical path 4 → 0; "average residual risk falls 1 point. Better overall, with some tradeoffs."  | 56 → 55; critical path 4 → 0; "average residual risk falls 1 point. Better overall, with some tradeoffs."  |
| Monitored alarm / access control           | 56 → 56; critical path 4 → 4; "No tradeoffs in this model."          | 56 → 55; critical path 4 → 4; "average residual risk falls 1 point. No tradeoffs in this model."           | 56 → 55; critical path 4 → 4; "average residual risk falls 1 point. No tradeoffs in this model."           |
| Cut daily cash exposure 20%                | 56 → 56; critical path 4 → 4; "Better overall, with some tradeoffs." | 56 → 54; critical path 4 → 0; "average residual risk falls 2 points. Better overall, with some tradeoffs." | 56 → 54; critical path 4 → 0; "average residual risk falls 2 points. Better overall, with some tradeoffs." |

Knock-on effects, before #208 → after #208 (the follow-up moves none):

- Install security cameras (cash/safe/front): "Faster detection shortens the assumed days until found, and a scheme found sooner builds up less loss." → that note, then "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Bond / screen cash handlers: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Monitored alarm / access control: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Cut daily cash exposure 20%: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."

Advanced reasoning, side-by-side comparison:

- Before #208: Switching on "Install security cameras (cash/safe/front)" lowers the cost-of-risk figure.
  - After #208: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 point and lowers the cost-of-risk figure.

## Nonprofit organization sample (`nonprofit`)

| Lever                                      | Before #208 (981e684)                                                | After #208 (bdfc90b)                                                                                       | After the follow-up                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Install security cameras (cash/safe/front) | 56 → 56; critical path 3 → 3; "No tradeoffs in this model."          | 56 → 55; critical path 3 → 0; "average residual risk falls 1 point. No tradeoffs in this model."           | 56 → 55; critical path 3 → 0; "average residual risk falls 1 point. No tradeoffs in this model."           |
| Bond / screen cash handlers                | 56 → 56; critical path 3 → 3; "Better overall, with some tradeoffs." | 56 → 55; critical path 3 → 0; "average residual risk falls 1 point. Better overall, with some tradeoffs."  | 56 → 55; critical path 3 → 0; "average residual risk falls 1 point. Better overall, with some tradeoffs."  |
| Cut daily cash exposure 20%                | 56 → 56; critical path 3 → 3; "Better overall, with some tradeoffs." | 56 → 54; critical path 3 → 0; "average residual risk falls 2 points. Better overall, with some tradeoffs." | 56 → 54; critical path 3 → 0; "average residual risk falls 2 points. Better overall, with some tradeoffs." |

Knock-on effects, before #208 → after #208 (the follow-up moves none):

- Install security cameras (cash/safe/front): "Faster detection shortens the assumed days until found, and a scheme found sooner builds up less loss." → that note, then "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Bond / screen cash handlers: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
- Cut daily cash exposure 20%: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."

Advanced reasoning, side-by-side comparison:

- Before #208: Switching on "Install security cameras (cash/safe/front)" lowers the cost-of-risk figure.
  - After #208: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 points and lowers the cost-of-risk figure.
  - After the follow-up: Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 point and lowers the cost-of-risk figure.

## General small business sample (`general`)

| Lever                       | Before #208 (981e684)                                                | After #208 (bdfc90b)                                                                                      | After the follow-up                                                                                       |
| --------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Cut daily cash exposure 20% | 61 → 61; critical path 4 → 4; "Better overall, with some tradeoffs." | 61 → 60; critical path 4 → 2; "average residual risk falls 1 point. Better overall, with some tradeoffs." | 61 → 60; critical path 4 → 2; "average residual risk falls 1 point. Better overall, with some tradeoffs." |

Knock-on effects, before #208 → after #208 (the follow-up moves none):

- Cut daily cash exposure 20%: "The direct effects dominate; knock-on effects were small under current inputs." → "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved."
