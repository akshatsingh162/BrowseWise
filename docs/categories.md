# Website categories

BrowseWise groups websites into nine categories: Education, Social Media, Entertainment, Development & Programming, Productivity, Shopping, News, Communication, and Other.

> **A category describes the website, not what you were doing there.** Someone may watch a lecture on YouTube or message a colleague on a social network. The interface says so wherever categories appear, and you can change any website's category yourself.

## How a category is chosen

The first rule that matches wins:

1. **Your own choice** for that exact domain (set on the Websites page).
2. **Local development:** `localhost`, local network names, and IP addresses count as Development & Programming.
3. **The domain list** in `src/shared/categories.config.js`. A domain also covers its subdomains, and a more specific entry beats a general one. For example `docs.google.com` is Productivity and `mail.google.com` is Communication, while plain `google.com` stays Other.
4. **Suffix rules** such as `.edu`, `.ac.uk`, and `.ac.in` (Education).
5. **Other.**

Matching works on whole labels, so `notgithub.com` is never mistaken for `github.com`.

## Your own choices

- Change a category with the dropdown on any row of the **Websites** page. A dot marks a category you changed, and **Reset to automatic** removes your choice.
- A choice applies to that **exact domain**. Changing `github.com` does not change `gist.github.com`.
- The change applies everywhere and to past days too, because categories are worked out when shown, not stored with the time.
- Choices are stored on this device only, as a list of domain and category pairs.

## Headline groups

| Group            | Made of                                            |
| ---------------- | -------------------------------------------------- |
| Productive sites | Education, Development & Programming, Productivity |
| Entertainment    | Entertainment                                      |
| Social media     | Social Media                                       |

"Productive sites" is a grouping of website types. It is not a measurement of how productive the time was.

## Adding or changing websites

Edit `src/shared/categories.config.js` and add the domain to the right list: lowercase, no `www.`, no path (for example `example.com`). Tests check that every domain is well formed, appears in only one category, and that a specific domain differs from its parent's category only where this is listed as intended. To add a deliberate exception, add it to the expected list in `tests/categories-config.test.js`.

## Known limitations

- **The list is finite.** Most of what people visit is not on it and lands in Other. The Websites page makes it easy to fix the ones you care about.
- **Some sites are ambiguous.** YouTube is Entertainment by default even though many people learn there. Reddit and LinkedIn are Social Media. Override them if that does not fit you.
- **Categories are a convenience, not a judgement.** They say nothing about intent or value.
- **Domain level only.** Different parts of one website cannot have different categories, other than through subdomain entries in the list.

## Data stored

Only one extra item: `categoryOverrides`, a map from domain to category id. Adding an optional item with a safe default needs no schema migration, because a missing item simply reads as "no changes".
