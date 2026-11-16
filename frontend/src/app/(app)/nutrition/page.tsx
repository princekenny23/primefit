"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Clock3, Leaf, Pill, Search, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/product-ui";
import { apiList, ApiNutritionGoal, ApiNutritionMealPlan, ApiNutritionSupplement } from "@/lib/api";
import { usePrimeFit } from "@/providers/app-provider";

export default function NutritionPage() {
  return <Suspense fallback={<div className="empty-state">Loading nutrition plans…</div>}><NutritionLibrary /></Suspense>;
}

function NutritionLibrary() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { notify } = usePrimeFit();
  const goalParam = searchParams.get("goal");
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "supplements" ? "supplements" : "meals";
  const [goals, setGoals] = useState<ApiNutritionGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalLoadError, setGoalLoadError] = useState("");
  const [goal, setGoal] = useState("");
  const [plans, setPlans] = useState<ApiNutritionMealPlan[]>([]);
  const [supplements, setSupplements] = useState<ApiNutritionSupplement[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedSupplement, setSelectedSupplement] = useState<ApiNutritionSupplement | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiList<ApiNutritionGoal>("/nutrition-goals/")
      .then((items) => {
        if (!cancelled) setGoals(items);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load nutrition goals.";
        setGoalLoadError(message);
        notify(message);
      })
      .finally(() => {
        if (!cancelled) setGoalsLoading(false);
      });
    return () => { cancelled = true; };
  }, [notify]);

  useEffect(() => {
    if (goalsLoading || goalLoadError) return;
    const nextGoal = goals.some((item) => item.id === goalParam) ? goalParam! : goals[0]?.id ?? "";
    setGoal((current) => current === nextGoal ? current : nextGoal);
    if (nextGoal && (goalParam !== nextGoal || !tabParam)) {
      router.replace(`/nutrition?goal=${encodeURIComponent(nextGoal)}&tab=${activeTab}`, { scroll: false });
    }
  }, [activeTab, goalLoadError, goalParam, goals, goalsLoading, router, tabParam]);

  useEffect(() => {
    if (!goal) return;
    let cancelled = false;
    const query = `?goal=${encodeURIComponent(goal)}`;
    setLibraryLoading(true);
    setLoadError("");
    setPlans([]);
    setSupplements([]);
    Promise.all([
      apiList<ApiNutritionMealPlan>(`/nutrition-meal-plans/${query}`),
      apiList<ApiNutritionSupplement>(`/nutrition-supplements/${query}`),
    ])
      .then(([mealPlans, goalSupplements]) => {
        if (cancelled) return;
        setPlans(mealPlans);
        setSupplements(goalSupplements);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load the nutrition library.";
        setLoadError(message);
        notify(message);
      })
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });
    return () => { cancelled = true; };
  }, [goal, notify]);

  function updateSelection(nextGoal: string, nextTab = activeTab) {
    setGoal(nextGoal);
    setSelectedSupplement(null);
    router.replace(`/nutrition?goal=${encodeURIComponent(nextGoal)}&tab=${nextTab}`, { scroll: false });
  }

  const filteredPlans = useMemo(() => plans.filter((plan) => `${plan.name} ${plan.description}`.toLowerCase().includes(search.toLowerCase())), [plans, search]);
  const selectedGoal = goals.find((item) => item.id === goal);

  return <>
    <div className="page-intro nutrition-intro">
      <span className="eyebrow">EAT WELL, YOUR WAY</span>
      <h1>A little more <em>nourishment.</em></h1>
      <p>Explore practical meal plans and goal-matched supplement guidance, made to fit real life.</p>
    </div>

    <section className="nutrition-goal-section" aria-labelledby="nutrition-goal-heading">
      <div className="nutrition-section-heading">
        <div><span className="eyebrow">START WITH WHAT MATTERS TO YOU</span><h2 id="nutrition-goal-heading">Choose your goal</h2></div>
        <span className="nutrition-goal-hint"><Leaf size={15} /> Your goal carries across both tabs</span>
      </div>
      <div className="nutrition-goal-filters" role="group" aria-label="Filter by fitness goal">
        {goals.map((item) => <button type="button" className={`nutrition-goal-filter ${goal === item.id ? "is-selected" : ""}`} key={item.id} aria-pressed={goal === item.id} onClick={() => updateSelection(item.id)}>{item.label}</button>)}
      </div>
      {goalLoadError && <p className="nutrition-load-error">{goalLoadError}</p>}
      {!goalsLoading && !goalLoadError && !goals.length && <p className="nutrition-load-error">No nutrition goals are configured yet.</p>}
    </section>

    <div className="nutrition-tabs" role="tablist" aria-label="Nutrition library">
      <button type="button" id="nutrition-meals-tab" role="tab" aria-selected={activeTab === "meals"} aria-controls="nutrition-meals-panel" className={activeTab === "meals" ? "active" : ""} onClick={() => updateSelection(goal, "meals")} disabled={!goal}><Leaf size={16} /> Meal plans <span>{plans.length}</span></button>
      <button type="button" id="nutrition-supplements-tab" role="tab" aria-selected={activeTab === "supplements"} aria-controls="nutrition-supplements-panel" className={activeTab === "supplements" ? "active" : ""} onClick={() => updateSelection(goal, "supplements")} disabled={!goal}><Pill size={16} /> Supplements <span>{supplements.length}</span></button>
    </div>

    {activeTab === "meals" ? <section id="nutrition-meals-panel" role="tabpanel" aria-labelledby="nutrition-meals-tab">
      <div className="nutrition-results-heading">
        <div><span className="eyebrow">{(selectedGoal?.label ?? "YOUR GOAL").toUpperCase()} · {filteredPlans.length} PLAN{filteredPlans.length === 1 ? "" : "S"}</span><h2>Plans for your pace</h2></div>
        <label className="nutrition-search"><Search size={16} /><input type="search" aria-label="Search meal plans" placeholder="Search meal plans" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      {libraryLoading || goalsLoading ? <div className="page-loading"><span />Loading meal plans…</div> : loadError ? <div className="empty-state"><h3>Meal plans are unavailable</h3><p>{loadError}</p></div> : filteredPlans.length ? <div className="nutrition-plan-grid">{filteredPlans.map((plan) => <article className="nutrition-plan-card" key={plan.id}>
        <Link className="nutrition-plan-image" href={`/nutrition/${plan.id}?goal=${goal}`} aria-label={`View ${plan.name} meal plan`}>
          {plan.image ? <Image src={plan.image} alt={`${plan.name} meal plan`} fill sizes="(max-width: 650px) 100vw, (max-width: 1000px) 50vw, 25vw" unoptimized /> : <span className="nutrition-image-placeholder"><Leaf size={28} /></span>}
          <span className="nutrition-image-label"><Leaf size={13} /> {selectedGoal?.label ?? plan.goal_label}</span>
        </Link>
        <div className="nutrition-plan-copy">
          <div className="nutrition-plan-meta"><span><Clock3 size={14} />{plan.duration}</span><span>{plan.meals.length} daily meals</span></div>
          <h3>{plan.name}</h3><p>{plan.description}</p>
          {plan.professional && <div className="nutrition-plan-author"><span className="nutrition-author-mark">{plan.professional.split(" ").map((part) => part[0]).join("")}</span><span><strong>{plan.professional}</strong><small>{plan.credentials}</small></span></div>}
          <Link className="button button-dark button-full" href={`/nutrition/${plan.id}?goal=${goal}`}>Explore meal plan <ArrowRight size={15} /></Link>
        </div>
      </article>)}</div> : <div className="empty-state"><Search size={23} /><h3>{plans.length ? "No plans found" : "No meal plans published yet"}</h3><p>{plans.length ? "Try a different search term." : "Published meal plans for this goal will appear here."}</p></div>}
    </section> : <section id="nutrition-supplements-panel" role="tabpanel" aria-labelledby="nutrition-supplements-tab">
      <div className="nutrition-results-heading">
        <div><span className="eyebrow">{(selectedGoal?.label ?? "YOUR GOAL").toUpperCase()} · GENERAL INFORMATION</span><h2>Supplement notes</h2></div>
        <span className="nutrition-disclaimer"><ShieldCheck size={15} /> Food first, always individual</span>
      </div>
      {libraryLoading || goalsLoading ? <div className="page-loading"><span />Loading supplement guidance…</div> : loadError ? <div className="empty-state"><h3>Supplement guidance is unavailable</h3><p>{loadError}</p></div> : supplements.length ? <div className="nutrition-supplement-grid">{supplements.map((supplement) => <article className="nutrition-plan-card nutrition-supplement-card" key={supplement.id}>
        <div className="nutrition-supplement-image">
          {supplement.image ? <Image src={supplement.image} alt={`${supplement.name} supplement`} fill sizes="(max-width: 650px) 100vw, (max-width: 1000px) 50vw, 25vw" unoptimized /> : <span className="nutrition-image-placeholder"><Pill size={28} /></span>}
          <span className="nutrition-image-label"><Pill size={13} /> {supplement.category}</span>
        </div>
        <div className="nutrition-plan-copy">
          <div className="nutrition-plan-meta"><span><ShieldCheck size={14} /> Goal-matched option</span><span>{selectedGoal?.label ?? supplement.goal_label}</span></div>
          <h3>{supplement.name}</h3><p>{supplement.summary}</p>
          <button type="button" className="button button-dark button-full" onClick={() => setSelectedSupplement(supplement)}>View supplement guidance <ArrowRight size={15} /></button>
        </div>
      </article>)}</div> : <div className="empty-state"><h3>No supplements published yet</h3><p>Published supplement guidance for this goal will appear here.</p></div>}
      <p className="nutrition-safety-note">Supplement information is general education, not a prescription or a substitute for personalized medical advice. Ask your doctor or registered dietitian before starting a supplement, especially if you take medication, are pregnant, or have a health condition.</p>
    </section>}
    {selectedSupplement && <Modal title={selectedSupplement.name} eyebrow={`${selectedSupplement.category.toUpperCase()} · ${selectedSupplement.goal_label.toUpperCase()}`} onClose={() => setSelectedSupplement(null)} className="nutrition-supplement-modal">
      <div className="nutrition-meal-detail">
        <section><span className="eyebrow">ABOUT THIS OPTION</span><p>{selectedSupplement.summary}</p></section>
        <section><span className="eyebrow">GENERAL GUIDANCE</span><p>{selectedSupplement.use}</p></section>
        <section className="nutrition-meal-alternative"><span className="eyebrow">SAFETY NOTE</span><p>{selectedSupplement.note}</p></section>
      </div>
      <p className="nutrition-safety-note">This is general education, not an individualized recommendation. Ask your healthcare professional before starting a supplement.</p>
    </Modal>}
  </>;
}
