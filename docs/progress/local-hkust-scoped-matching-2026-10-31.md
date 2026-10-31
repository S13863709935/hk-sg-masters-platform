# HKUST concentration and study-mode comparisons

Date: 2026-10-31. Internal implementation and data-maintenance record, not assessment submission content.

## Result

Existing programme evidence now supports explicit concentration choices and selected-mode conditions. No catalogue award is added. HKUST ILE remains one MA under its original ID, with two standalone partial TESL/TCSL snapshots. Finance's part-time work-year condition and regular MBA's full-time/weekly part-time conditions apply only to the exact selected offering. All records remain partial; source-independent review, complete eligibility and recommendation tiers are not created.

The [structured observation](../../data/research/hkust-scoped-matching-observation-2026-10-31.json), [school quality matrix](../research/hkust-scoped-matching-quality-2026-10-31.md), [269-unit worklist](../research/source-review-queue-2026-10-31-hkust-scoped-matching.md) and [core acceptance](../research/core-pilot-acceptance-2026-10-31-hkust-scoped-matching.md) retain the sources, dates and limitations. Official pages were retrieved through the web tool; cache freshness and live application availability are not independently confirmed.

## Concentrations and language scores

The [2027/28 ILE programme body](https://prog-crs.hkust.edu.hk/pgprog/2027-28/ma-ile) explicitly requires TESL or TCSL selection at application. Its existing directory identity gains programme-body concentration evidence; neither choice is counted as another degree. TESL requires IELTS overall 7.0 with Writing 7.0 and other components 5.5, or old TOEFL 100/Writing 27, or new TOEFL 5/Writing 5.5. TCSL retains its separate IELTS 6.5/5.5 and TOEFL 85/4.5 thresholds. English waiver and TCSL's conditional HSK 5/PSC 2B evidence remain manual; passing English does not satisfy them.

The form now accepts original TOEFL section scores as well as totals: 0–30 integer sections for the 0–120 version, and 1–6 half-band sections for the newer version. Scores are not converted. Unknown required Writing scores remain unknown, and an unlisted section minimum is not invented. A named Writing minimum combines with the general component floor using the stricter applicable value. User-facing hints, detail/compare rule text and public shortlist evidence preserve those distinctions.

Both ILE snapshots independently record the common one-year FT option, HKD 165,000 total, separate HKD 260 application fee and September 2027/1 April 2027 date context. Earlier route-free remembered ILE choices now require explicit concentration selection; they are not silently assigned to TESL or TCSL. New explicit choices survive restore and export with the selected route ID.

## Mode-specific work and assessment

The [Finance catalogue](https://prog-crs.hkust.edu.hk/pgprog/2027-28/msc-fina) has no FT minimum work duration, while PT requires one full-time post-qualification work year. Its comparison is now bound only to September 2027 PT. The [regular MBA catalogue](https://prog-crs.hkust.edu.hk/pgprog/2027-28/ft-pt-mba/) requires two years for FT and three for PT; separate exact-mode comparisons replace the common two-year lower bound. FT GMAT/GRE is a mode-bound manual condition. DET 125 is now recorded as a manual published alternative, because this form does not compare DET.

Enough aggregate work years still does not prove full-time status, post-qualification timing, documentary acceptance or any other unresolved condition. Selecting no mode leaves conditional comparisons unresolved; selecting another mode does not impose a sibling's work rule. Other MBA dates, applicant categories, fees and delivery cautions remain at their previous source dates.

Each conditional rule records owned offering IDs, academic year, a public scope label and its source-read date. Import rejects foreign IDs, duplicate bindings, wrong academic years and missing/future source evidence. A server-only selection marker survives the legitimate applicant-category projection; copied JSON cannot forge an activated mode. Public evidence exports include scope and named component thresholds, with private/unknown nested fields excluded.

Routes may now retain older dated supporting sources alongside a later scoped read. A newest same-route official-page observation is still required; sources after the snapshot date are rejected. This avoids relabelling 30 October fee/date observations as 31 October checks.

## Validation and preservation

Fourteen new tests cover independent concentration thresholds, both TOEFL Writing scales, missing evidence, correct section ranges/precision, mode-specific years, conditional GMAT evidence, forged selection objects, malformed imports, dated-source preservation and remembered-choice migration. Actual API comparisons exercise concentration/mode selection and saved restoration; form-helper tests cover score controls and range changes. The earlier batch traversal now follows both ILE routes as well, covering 44 option/category combinations rather than attempting to reuse an unselected old ILE offering.

Full suite: 1,261 tests passed; zero failed/cancelled/skipped, in 133.4 seconds at concurrency four. Both modified browser modules also pass the JavaScript syntax check. Original core twenty IDs and 71 selection variants still produce 497 synthetic comparisons: 125 gaps, 372 unresolved, zero fully met and zero violations. No real student data, user testing or independent review is claimed. Tests use memory/temporary databases, not the daily database.

Catalogue/default browsing/partial/lead totals remain 873/869/174/699. Routes become seven groups/seventeen snapshots. All 78 applicant contexts/158 categories remain unchanged and correctly bound; maintenance units 269, near-cutoff units three, stale bindings zero. The other 172 checked parent objects, fourteen prior route snapshots, original three scope decisions, pilot IDs, workbook and historical observations/reports remain unchanged. Only ILE's listing gains newer programme-body concentration evidence. Old directory builders continue to reject overwriting this newer record; their tests now separately exercise historical reconstruction and preservation of unrelated evidence.

Save this as one local implementation batch. No push, deployment, course submission or change to main/published weekly checkpoints. Recommendation: combine it with the next planned weekly publication rather than pushing after each continuation. Next useful data work is school-sized coverage with these applicability rules, while retaining unresolved official-source conflicts and delivery evidence.
