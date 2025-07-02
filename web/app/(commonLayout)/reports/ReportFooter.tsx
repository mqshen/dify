'use client'

import { useTranslation } from 'react-i18next'

const DatasetFooter = () => {
  const { t } = useTranslation()

  return (
    <footer className='shrink-0 grow-0 px-12 py-6'>
      <h3 className='text-gradient text-xl font-semibold leading-tight'>{t('report.didYouKnow')}</h3>
      <p className='mt-1 text-sm font-normal leading-tight text-text-secondary'>
        {t('report.intro1')}<span className='inline-flex items-center gap-1 text-text-accent'>{t('report.intro2')}</span>{t('report.intro3')}<br />
        {t('report.intro4')}<span className='inline-flex items-center gap-1 text-text-accent'>{t('report.intro5')}</span>{t('report.intro6')}
      </p>
    </footer>
  )
}

export default DatasetFooter
