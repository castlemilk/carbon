import { cache } from 'react'

import { openDb as rawOpenDb } from './index'

export const openDb = cache(() => rawOpenDb(process.env.CARBON_DB))
