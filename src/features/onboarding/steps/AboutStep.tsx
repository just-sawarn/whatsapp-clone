import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { aboutSchema, aboutSuggestions } from '../onboardingSchemas'
import type { OnboardingData } from '../useOnboardingState'
import { StepFrame } from './StepFrame'

type Props = {
  data: OnboardingData
  save: (patch: Partial<OnboardingData>) => void
  next: () => void
  back: () => void
}

export function AboutStep({ data, save, next, back }: Props) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(aboutSchema),
    defaultValues: { about: data.about },
  })
  const about =
    useWatch({ control, name: 'about', defaultValue: data.about }) ?? ''
  return (
    <StepFrame
      title="A little about you"
      description="A short note that appears on your profile."
      onBack={back}
      onSubmit={() =>
        void handleSubmit((values) => {
          save({ about: values.about.trim() })
          next()
        })()
      }
    >
      <div className="grid gap-1.5">
        <label htmlFor="about" className="text-[13px] font-medium text-muted">
          About
        </label>
        <textarea
          id="about"
          rows={3}
          autoFocus
          maxLength={140}
          className="resize-none rounded-lg border border-divider bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          {...register('about')}
        />
        <div className="flex justify-between text-xs">
          <span role="alert" className="text-danger">
            {errors.about?.message}
          </span>
          <span className="text-muted">{about.length}/140</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Suggestions">
        {aboutSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() =>
              setValue('about', suggestion, { shouldValidate: true })
            }
            className="rounded-full bg-panel px-3 py-1.5 text-[13px] hover:bg-surface-hover"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </StepFrame>
  )
}
