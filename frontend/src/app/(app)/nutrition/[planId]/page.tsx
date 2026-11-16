"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock3, Leaf, ShieldCheck, UserRound } from "lucide-react";
import { Modal } from "@/components/product-ui";
import { apiRequest, ApiNutritionMeal, ApiNutritionMealPlan } from "@/lib/api";

export default function MealPlanDetailsPage() {
  const params = useParams<{ planId: string }>();
  const [plan, setPlan] = useState<ApiNutritionMealPlan | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<ApiNutritionMeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiRequest<ApiNutritionMealPlan>(`/nutrition-meal-plans/${encodeURIComponent(params.planId)}/`)
      .then((item) => {
        if (!cancelled) setPlan(item);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this meal plan.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [params.planId]);

  if (loading) return <div className="page-loading"><span />Loading meal plan…</div>;
  if (error || !plan) return <div className="nutrition-not-found"><span className="eyebrow">PLAN UNAVAILABLE</span><h1>{error || "We couldn’t find that meal plan."}</h1><p>Browse the library to find another published plan.</p><Link className="button button-dark" href="/nutrition"><ArrowLeft size={15} /> Back to Diet plan</Link></div>;

  return <>
    <Link className="nutrition-back-link" href={`/nutrition?goal=${encodeURIComponent(plan.goal)}&tab=meals`}><ArrowLeft size={15} /> All meal plans</Link>
    <article className="nutrition-detail">
      <div className="nutrition-detail-hero">
        {plan.image ? <Image src={plan.image} alt={`${plan.name} cover`} fill priority sizes="(max-width: 800px) 100vw, 60vw" unoptimized /> : <div className="nutrition-detail-hero-placeholder"><Leaf size={36} /></div>}
        <span className="nutrition-image-label"><Leaf size={13} /> {plan.goal_label}</span>
        <div className="nutrition-detail-hero-copy"><span className="eyebrow">A PLAN FOR YOUR PACE</span><h1>{plan.name}</h1><p>{plan.description}</p></div>
      </div>

      <div className="nutrition-detail-layout">
        <div className="nutrition-detail-main">
          <div className="nutrition-detail-facts">
            <div><Clock3 size={17} /><span><small>PLAN LENGTH</small><strong>{plan.duration}</strong></span></div>
            <div><Leaf size={17} /><span><small>SUPPORTS</small><strong>{plan.goal_label}</strong></span></div>
            <div><UserRound size={17} /><span><small>CREATED BY</small><strong>{plan.professional}</strong></span></div>
          </div>
          <section className="nutrition-plan-description"><span className="eyebrow">HOW TO USE THIS PLAN</span><h2>A flexible daily rhythm</h2><p>{plan.schedule}</p><p className="nutrition-plan-calories">{plan.calories}</p></section>

          <section className="nutrition-daily-schedule">
            <div className="nutrition-section-heading"><div><span className="eyebrow">A SAMPLE DAY</span><h2>Your daily meal schedule</h2></div><span className="nutrition-schedule-count">{plan.meals.length} meals & snacks</span></div>
            <div className="nutrition-meal-list">{plan.meals.map((meal, index) => <button type="button" className="nutrition-meal-row" key={meal.id} onClick={() => setSelectedMeal(meal)}>
              <span className="nutrition-meal-index">{String(index + 1).padStart(2, "0")}</span><span className="nutrition-meal-copy"><small>{meal.time}</small><strong>{meal.name}</strong><span>{meal.ingredients}</span></span><span className="nutrition-meal-open">Details <ArrowRight size={14} /></span>
            </button>)}</div>
          </section>
        </div>

        <aside className="nutrition-detail-aside">
          <div className="nutrition-professional-card"><span className="nutrition-professional-icon"><UserRound size={21} /></span><span className="eyebrow">CREATED BY</span><h3>{plan.professional}</h3><p>{plan.credentials}</p><span className="nutrition-verified"><Check size={13} /> Nutrition professional</span></div>
          <Link className="nutrition-supplement-link" href={`/nutrition?goal=${encodeURIComponent(plan.goal)}&tab=supplements`}><span><PillBadge /><strong>Explore supplements</strong><small>Suggestions for the same goal</small></span><ArrowRight size={16} /></Link>
          <div className="nutrition-professional-note"><ShieldCheck size={16} /><p>Nutrition needs are personal. Adjust portions to your needs and check with a healthcare professional if you have a medical condition or dietary restrictions.</p></div>
        </aside>
      </div>
    </article>
    {selectedMeal && <Modal title={selectedMeal.name} eyebrow={selectedMeal.time.toUpperCase()} onClose={() => setSelectedMeal(null)} className="nutrition-meal-modal">
      <div className="nutrition-meal-detail">
        <section><span className="eyebrow">INGREDIENTS</span><p>{selectedMeal.ingredients}</p></section>
        <section><span className="eyebrow">SUGGESTED QUANTITIES</span><p>{selectedMeal.quantity}</p></section>
        <section><span className="eyebrow">PREPARATION</span><p>{selectedMeal.preparation}</p></section>
        <section className="nutrition-meal-alternative"><span className="eyebrow">EASY ALTERNATIVES</span><p>{selectedMeal.alternative}</p></section>
      </div>
    </Modal>}
  </>;
}

function PillBadge() {
  return <span className="nutrition-pill-badge"><ShieldCheck size={18} /></span>;
}
