// ==UserScript==
// @name        	Hamster AutoUpgrader
// @match       	*://*hamsterkombatgame.io/*
// @exclude-match 	*://*hamsterkombatgame.io/games/*
// @icon         	https://hamsterkombatgame.io/images/icons/hamster-coin.png
// @grant       	none
// @version     	3.9
// @author      	Ergamon
// @description 	Updated: 17.09.2024 (started 03.08.2024, 15:20:47)
// @downloadURL  https://github.com/draftpin/hamster-kombat-autogame/raw/main/hamster-kombat-autogame.user.js
// @updateURL    https://github.com/draftpin/hamster-kombat-autogame/raw/main/hamster-kombat-autogame.user.js
// @homepage     https://github.com/draftpin/hamster-kombat-autogame
// ==/UserScript==


const gBot = { 
	logPrefix: 'Hamster Upgrader',
	cards: {
		maxPaybackHours: 15000,
		maxLevel: 25
	},
	keysUrl: 'https://hamster.gamedrive.pro/keys.json',
	autoRestartAt: [ '14:20', '15:30', '23:15' ],
	youtubeWatchAt: [ '10:05', '16:40', '20:00', '03:15' ],
	checkKeysAt: [ '05:05', '09:05', '18:05' ],
	startedAt: new Date,
	myName: '',
	dayKeys: '',
	taskInProgress: {}
}

function arrayDiff(arr1, arr2) {
	return arr1.filter(item => !arr2.includes(item))
}

function getHourMins(date = new Date) {
	const mins = date.getMinutes()
	const hours = date.getHours()
	return (hours < 10 ? '0' + hours : hours) + ':' + (mins < 10 ? '0' + mins : mins)
}

function getFuncName(stackId = 0) {
    function extractFuncFromLine(line) {
      return line.trim().split(' ')[1]
    }
    const ignoreFunc = ['err', 'dbg', 'log', 'wrn', 'cb', 'jso' ]
    const errorStack = new Error().stack.split('\n').slice(2)
    // logger.info(errorStack)
    if (!stackId) {
      	for (const line of errorStack) {
        	let funcName = extractFuncFromLine(line)
        	if (!funcName) {
          		continue
        	}
        	const dotPos = funcName.indexOf('.')
        	if (dotPos > 0) {
          		funcName = funcName.slice(dotPos + 1)
        	}
        	if (ignoreFunc.includes(funcName.slice(0, 3))) {
          		continue
        	}

			if (['resolve', 'new', '<anonymous>'].includes(funcName)) {
        		funcName = line.slice(line.lastIndexOf('/') + 1, line.lastIndexOf(':'))
        	}
        	return funcName
      	}
    }
   	return extractFuncFromLine(errorStack[stackId])
}
function getLogPrefix() { return `${(new Date).toLocaleTimeString()} %c[${gBot.logPrefix}]` }
function log(...data) { return console.info(`${getLogPrefix()}`, 'color: blue', ...data) }
function dbg(...data) { return console.info(`${getLogPrefix()}[${getFuncName()}]`, 'color: blue', ...data) }
function wrn(...data) { return console.warn(`${getLogPrefix()}[${getFuncName()}]`, 'color: orange', ...data) }
function err(...data) { return console.error(`${getLogPrefix()}[${getFuncName()}]`, 'color: purple', ...data) }

const waitMs = (ms) => new Promise((resolve) => setTimeout(() => resolve(true), ms))
async function clickWaitMs(buttonOrSelector, ms) {
	const button = typeof buttonOrSelector === 'string' ? document.querySelector(buttonOrSelector) : buttonOrSelector
	if (!button || typeof button !== 'object' || button.disabled) {
		err('Incorrect or disabled button:', buttonOrSelector)
		err(button)
		return false
	}

	button.click()
	await waitMs(ms)
	return true
}

let pause = false
const gTimers = { main: null, modal: null, miniGames: null, restartOnFail: null, upgrades: {} }

function hamHourProfitToNum(str) {
	const float = parseFloat(str.replace(',', '.'))
	switch(str.slice(-1)) {
		case 'K': return float * 1000
		case 'M': return float * 1000 * 1000
	}
	return float
}

function isElemVisible(elem) {
	return elem && elem.style.display !== 'none'
}

function isTimeReady(now = new Date, timeArray) {	
	for (const time of timeArray) {
		const [ taskHour, taskMin ] = time.split(':').map(str => str * 1)

		if (now.getHours() !== taskHour) continue
		if (now.getMinutes() >= taskMin && now.getMinutes() <= taskMin + 5) {
			return true
		}
	}
	return false
}

function autoRestartReady(now = new Date) {
	const justStarted = (now - gBot.startedAt) / 1000 < 5 * 60
	// dbg('justStarted:', justStarted)
	if (justStarted) return

	const restartReady = isTimeReady(now, gBot.autoRestartAt)
	// dbg('AutoRestart ready:', restartReady)
	// if (restartReady) dbg('AutoRestart ready!')
	return restartReady
}

function autoRestart() {
	dbg('Авторестарт!')
	location.reload()	
}

async function getDailyTaskButton(timeout) {
	return await waitElement('[srcset="/images/attraction/daily_reward.webp"]', timeout)
}

async function getDailyRewardButtonReady() {
	const elem = await getDailyTaskButton()
	return elem && !elem.parentNode.parentNode.parentNode.classList.contains('is-completed') ? elem : null
}

async function dailyReward() {
	const taskButtonReady = await getDailyRewardButtonReady()
	if (!taskButtonReady) return

	await clickWaitMs(taskButtonReady, 2000)

	dbg('Забираем дневную награду!')
	// https://cdn.hamsterkombat.io/earn/calendar.webp

	await clickWaitMs('[srcset*="calendar.webp"]', 5000)
	await clickWaitMs('.bottom-sheet-close', 1000)

	// document.querySelector('[srcset*="calendar.webp"]').click()
	setMainWindow()
	// setTimeout(setMainWindow, 60000)
}

function addTask(taskName) {
	if (Object.keys(gBot.taskInProgress).length > 0) {
		err('Уже есть задание в процессе:', Object.keys(gBot.taskInProgress))
		return false
	}
	gBot.taskInProgress[taskName] = new Date
	return true
}

function removeTask(taskName) {
	if (gBot.taskInProgress[taskName]) {
		delete gBot.taskInProgress[taskName]
		return true
	}
	return false
}

const runTask = {
	async youtubeWatch() {
		dbg('Запускаем задание...')
		if (!addTask('youtubeWatch')) return

		function getNotCompletedVideoCards() {
			return Array.from(document.querySelectorAll('.earn-item:not(.is-completed) [srcset*=youtube]'))
		}

		async function watchVideos() {
			dbg('Проверяем новые видео...')
			const taskButton = await getDailyTaskButton(1000)
			if (taskButton) await clickWaitMs(taskButton, 2000)

			const notCompletedYoutubeCards = getNotCompletedVideoCards()
			dbg(notCompletedYoutubeCards)

			for (const videoCard of notCompletedYoutubeCards) {
				dbg('Открываем видео')
				await clickWaitMs(videoCard, 2000)
				await clickWaitMs('.bottom-sheet-button', 3000)
				await clickWaitMs('.bottom-sheet-close', 1000)
			}

			if (getNotCompletedVideoCards().length === 0) {
				removeTask('youtubeWatch')
				dbg('Все видео просмотрены. Возвращаемся в главное меню')
				setMainWindow()
				return true
			} else {
				dbg('Запущены новые видео. Сбрасываем таймер и повторяем')
				for (let i = 0; i < localStorage.length; i++) {
					let key = localStorage.key(i)

					if (key.startsWith("hamster_youtube_")) {
					  	let unixTime = parseInt(localStorage.getItem(key), 10)

						if (!isNaN(unixTime)) {
							let newUnixTime = unixTime - 3660

							localStorage.setItem(key, newUnixTime.toString())
						}
		  			}
				}
				await waitMs(1000)
				await watchVideos()
			}
		}
		await watchVideos()
	},

	async checkKeys() {
		dbg('Запускаем задание...')
		if (!addTask('checkKeys')) return

		const navIconPlayGround = await waitElement('.app-bar-nav .icon-playground')
		for (let tries = 0; tries < 3; tries++) {
			navIconPlayGround.click()
			await waitMs(1000)
			const keysPrefixes = [] // [ 'TRIM', 'RACE', 'POLY', 'TWERK', 'MERGE', 'CLONE', 'CUBE', 'TRAIN', 'BIKE' ]
			const key2gameTitles = {
				FCTRY: 'Factory World',
				INFCT: 'Infected Frontier',
				RACE: 'Mud Racing',
				TWERK: 'Twerk Race'
			}
			const needKeys = {}
			let myKeys = {}
			let error = null
			document.querySelectorAll('.playground-item').forEach(async keysCollected => {
				if (error) return
				if (keysCollected.querySelector('.is-done')) return
				if (!Object.keys(myKeys).length) {
					try {
						const myName = getMyName()
						myKeys = await getKeys(myName)
						if (!myKeys || myKeys.length === 0) {
							throw new Error('Не найдены ключи!', myKeys)
						}
						const keyTemplate = /^([A-Z]{3,})-[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{3}$/
						for (const key of myKeys) {
							const keyMatch = key.match(keyTemplate)
							if (!keyMatch) {
								err('Некорректный ключ:', key)
								continue
							}
							const gameName = keyMatch[1]
							if (!keysPrefixes.includes(gameName)) keysPrefixes.push(gameName)
						}
					} catch (e) {
						error = e
						err (e)
						updateKeysUI(e)
					}
					dbg('Найдены ключи для игр:', keysPrefixes)
				}


				const gameTitle = keysCollected.querySelector('.playground-item-title').innerText
				const [ claimedKeys, availableKeys ] = keysCollected.querySelector('.playground-item-footer-left-counter').innerText.split('/')

				const gameNameShort = keysPrefixes.find(keyName => {
					if (key2gameTitles[keyName]) {
						return gameTitle === key2gameTitles[keyName]
					}
					dbg('Проверяю ключ:', keyName, gameTitle, gameTitle.toLowerCase().includes(keyName.toLowerCase()))
					return gameTitle.toLowerCase().includes(keyName.toLowerCase())
				})

				dbg(`[${gameNameShort}] Keys: ${claimedKeys}/${availableKeys}`)
				if (claimedKeys < availableKeys) {
					needKeys[gameNameShort] = availableKeys - claimedKeys
				}
			})
			dbg('Нужны ключи:', needKeys)
			await setMainWindow()

			const needKeysForGames = Object.keys(needKeys)
			if (!needKeysForGames.length) {
				updateKeysUI('OK')
				dbg('Все ключи получены!')
				break
			}

			try {
				await redeemKeys(myKeys, needKeys)
			} catch (e) {
				wrn(e)
				break
			}
		}
		removeTask('checkKeys')
	}
}

function updateKeysUI(msg) {
	const keysElem = document.querySelector('.header-balances-keys span')
	const keysText = keysElem.innerText

	const style = msg === 'OK' ? 'color: green' : 'color: red'
	keysElem.innerHTML = keysText + ' --- [<span style="' + style + '">' + msg + '</span>]'
}

async function setMainWindow() {
	await clickWaitMs('.app-bar-nav .exchange-image', 2000)
}


function taskReady(taskName = '', now = new Date) {
	if (!taskName) {
		err('Task name must be provided')
		return
	}

	if (gBot.taskInProgress[taskName]) {
		dbg(`[${taskName}] Task in progress!`)
		return false
	}
	const taskReady = isTimeReady(now, gBot[taskName + 'At'])
	// dbg(`[${taskName}] Task ready:`, taskReady)
	return taskReady
}

function manualUpgrade(selector) {
	let upgradeCard = document.querySelector('.' + selector)
	if (!upgradeCard) {
		upgradeCard = document.querySelector('.upgrade-item [alt=' + selector + ']')
		if (!upgradeCard) {
			err('Карточка апдейта не обнаружена:', selector)
			return false
		}
	}

	if (upgradeCard.type === 'image/webp') upgradeCard = upgradeCard.parentNode.parentNode.parentNode

	const upgradeCardNotReady = isElemVisible(upgradeCard.querySelector('.is-blur')) || isElemVisible(upgradeCard.querySelector('.upgrade-progress'))
	if (upgradeCardNotReady) return log('Карточка апдейта найдена, но не готова:', selector)

	const upgradeButton = document.querySelector('button.bottom-sheet-button')
	if (!upgradeButton) {
		log('Карточка апдейта найдена. Кликаем!', selector)
		upgradeCard.click()
		clearTimeout(gTimers.upgrades[selector])
		setTimeout(hamsterAutoUpgrade, 2000, selector)
		return true
	}

	const priceElement = document.querySelector('.upgrade-buy-info .price-value')
	const priceCard = priceElement.parentNode.parentNode.parentNode
	const upgradePrice = parseInt(priceElement.innerText.replace(/[^0-9]/g, ''), 10)
	const hourProfit = hamHourProfitToNum(priceCard.querySelector('.upgrade-buy-stats-info .price-value').innerText)
	const paybackHours = Math.floor(upgradePrice / hourProfit)

	const { maxPaybackHours } = gBot.cards
	dbg(`${selector} Цена: ${upgradePrice} Прибыль в час: ${hourProfit} Часов для возврата: ${paybackHours} / ${maxPaybackHours}`)
	if (paybackHours > maxPaybackHours) {
		wrn('Апдейт слишком дорогой. Завершаем работу')
		document.querySelector('.bottom-sheet-close').click()
		return false
	}


	if (upgradeButton.disabled) {
		wrn('Апдейт не готов. Выключаем')
		document.querySelector('.bottom-sheet-close').click()
	} else {
		log('Апдейт готов. Кликаем!')
		upgradeButton.click()
	}
	return true
}

function apiUpgrade(selector) {
	// dbg (selector)

	const item = useNuxtApp().$pinia._s.get('upgrade').upgradesForBuy.find(item => item.id === selector)
	if (!item) {
		err('Завершаем работу. Карточка апдейта не обнаружена:', selector)
		return false
	}

	// return item.isAvailable && !item.cooldownSeconds && !item.isExpired && paybackHours <= maxPaybackHours
	if (!item.isAvailable || item.isExpired) {
		err('Завершаем работу. Апгрейд не доступен:', selector)
		return false		
	}

	if (item.cooldownSeconds) {
		log('Карточка апдейта найдена, но не готова:', selector)
		return true
	}

	const paybackHours = getPayBackHours(item)
	const { maxPaybackHours } = gBot.cards
	dbg(`${selector} Цена: ${item.price} Прибыль в час: ${item.profitPerHourDelta} Часов для возврата: ${paybackHours} / ${maxPaybackHours}`)

	if (paybackHours > maxPaybackHours) {
		wrn('Апдейт слишком дорогой. Завершаем работу')
		clearTimeout(gTimers.upgrades[selector])
		return false
	}

	log('Апдейт готов. Покупаем!', selector)
	useNuxtApp().$pinia._s.get('upgrade').postBuyUpgrade(item.id)
	return true
}

function hamsterAutoUpgrade(selector, { method = 'API' } = {}) {
	if (pause) return wrn('Выключено')

	gTimers.upgrades[selector] = setTimeout(hamsterAutoUpgrade, 60 * 1000, selector)

	// autoCloseModal()

	let upgradeOK = false
	if (method === 'manual') {
		upgradeOK = manualUpgrade(selector)
	} else {
		upgradeOK = apiUpgrade(selector)
	}

	if (!upgradeOK) { 
		clearTimeout(gTimers.upgrades[selector])
		gTimers.upgrades[selector] = null
	}
}

function autoCloseModal() {
	const modals = [ 
			'.daily-reward .button.button-primary.button-large',
			'.daily-combo-success-button button', 
			'.daily-combo-success',
			// '.bs-content .bottom-sheet-button.button.button-primary.button-default',
			// '.bs-content .bottom-sheet-button.button.button-primary.button-large.pulse',
			'.season-end .button.button-default.button-primary',
			'.bs-content .bottom-sheet-button.button.button-primary:not([href$="HamsterKombat_Official"])',
			'.bs-passive .bottom-sheet-button.button.button-primary.button-large',
			'.bs-content-daily + button',
			'.attraction-success' 
		]

	for (const modal of modals) {
		const elem = document.querySelector(modal)
		if (elem && !elem.disabled) {
			dbg('Автоподтверждение модального окна:', modal)
		 	elem.click()

		 	// Два модальных окна сразу не бывает, выходим из цикла
		 	return true
		 }
	}
	return false
}

async function waitElement(selector, timeout = 30 * 60 * 1000) {
	let waitTimeout = false
	const waitTimeoutTimer = setTimeout(() => waitTimeout = true, timeout)
	while (true) {
		if (waitTimeout) break
		const elem = document.querySelector(selector)
		if (elem) {
			return elem
		}
		await waitMs(500)
	}
	return null
}

function appReady() {
	return useNuxtApp()?.$pinia?._s?.get('upgrade')?.upgradesForBuy
}

function appInUseMobileMode() {
	const bodyText = document.body.innerText.toLowerCase()
	return bodyText.includes('play ') && bodyText.includes(' mobile')
	/*
	let result = bodyText.includes('play ') && bodyText.includes(' mobile')
	if (!result) return false

	wrn(location.href)
	wrn('Mobile text detected:', bodyText)
	let pos = bodyText.indexOf('play')
	wrn('Part of text:', bodyText.slice(pos, pos+20))
	pos = bodyText.indexOf('mobile')
	wrn('Part of text:', bodyText.slice(pos-10, pos+10))
	return true
	*/
}

function getPayBackHours(item) {
	return Math.floor(item.price / item.profitPerHourDelta)
}

function dateDiffInDays(a = new Date, b = new Date) {
  	const _MS_PER_DAY = 1000 * 60 * 60 * 24
  	// Discard the time and time-zone information.
  	a = new Date(a)
  	b = new Date(b)

  	const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
 	const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())

 	return Math.floor((utc2 - utc1) / _MS_PER_DAY)
}

function getNewUpgrades() {
	// New cards: 
	const { maxPaybackHours, maxLevel } = gBot.cards
	// const excludes = ['business_jet', 'call_btc_rise', 'rolex_soulmate']
	const excludes = []
	return useNuxtApp().$pinia._s.get('upgrade').upgradesForBuy
		.filter(item => item.isAvailable && !item.isExpired && item.profitPerHour && 
			(item.level < maxLevel || (item.releaseAt && dateDiffInDays(item.releaseAt) < 30)) && !excludes.includes(item.id) &&
			getPayBackHours(item) <= maxPaybackHours
		).map(item => item.id)
}

let prevNewUpgrades = []
async function autoGame() {
	dbg('Проверяем задания...')
	// dbg('Timeout:', timeoutMs, 'prevNewUpgrades:', prevNewUpgrades, 'prevUpgradesInProgress:', prevUpgradesInProgress)
	if (pause) return
	
	// const newUpgrades = useNuxtApp().$pinia._s.get('upgrade').upgradesForBuy
	// 	.filter(item => item.isAvailable && !item.isExpired && item.profitPerHour && dateDiffInDays(item.releaseAt) <= 1)
	// 	.map(item => item.id)

	// await dailyReward()
	if (autoRestartReady()) return autoRestart()
	if (taskReady('youtubeWatch')) runTask['youtubeWatch']()
	if (taskReady('checkKeys')) await runTask['checkKeys']()


	// if (!appReady()) { 
	// 	dbg('App loading')
	// }

	try {
		const newUpgrades = getNewUpgrades()
		const upgradesInProgress = Object.keys(gTimers.upgrades)

		if (arrayDiff(newUpgrades, prevNewUpgrades).length > 0) {
			
			dbg('Новые улучшения:', newUpgrades)
			dbg('Улучшения в процессе:', upgradesInProgress)

			for (const upgrade of newUpgrades) {
				if (!upgradesInProgress.includes(upgrade)) {
					hamsterAutoUpgrade(upgrade)
					await waitMs(10000)
				}
			}		
		}		
	} catch (e) {
		dbg('App not ready:', e)
	}

	// setTimeout(autoGame, { timeoutMs, prevNewUpgrades: newUpgrades })
	
	// hamsterAutoUpgrade('.upgrade-item [alt=crypto_farming]')
	/*
	hamsterAutoUpgrade('web3_advertising')
	await waitMs(10000)
	hamsterAutoUpgrade('adv_integration_3107')
	hamsterAutoUpgrade('welcome_to_ogames', { method: 'manual'})
	await waitMs(10000)
	hamsterAutoUpgrade('.hamsterbank')
	*/
}

function patchMiniGames() {
	if (window.self !== window.top) return

	dbg('Патчим мини-игру...')

	const puzzle = document.querySelector('.minigame-puzzle')
	if (!puzzle) return

	const minigame = document.querySelector('.minigame')
	const minigameBg = document.querySelector('.minigame-bg')

	if (minigame) {
		minigame.style.position = 'fixed';
		minigame.style.width = '418px' // 597px уменьшено на 30%
		minigame.style.height = '661px' // 945px уменьшено на 30%
	}

	if (minigameBg) {
		minigameBg.style.position = 'fixed';
		minigameBg.style.width = '418px' // 597px уменьшено на 30%
		minigameBg.style.height = '661px' // 945px уменьшено на 30%
	}

	// Модификация игры с ключами
	const defaultStringify = JSON.stringify
	JSON.stringify = function (gameData) {
		if (gameData?.level) {
			gameData.level = '- - - - - -.- - - - - -.- - 0 0 - -.- - - - - -.- - - - - -.- - - - - -'
		}
		return defaultStringify(gameData)
	}
}

async function getMyName() {
	if (!gBot.myName) {
		gBot.myName = (await waitElement('.user-info p')).innerText.slice(0, -6)
		dbg('Имя получено:', gBot.myName)
	}
	return gBot.myName
}

async function redeemKeys(json, needKeys = { 'CLONE': 4, 'CUBE': 4, 'TRAIN': 4, 'BIKE': 4 }) {
	const myName = await getMyName()
	if (typeof json === 'string') json = JSON.parse(json)
	const myKeys = Array.isArray(json) ? json : json[myName]
	dbg(myKeys)

	let promoContainer
	for (let tries = 0; tries < 3; tries++) {
		promoContainer = document.querySelector('.promocode-input-container')
		if (promoContainer) break

		dbg('Opening promoContainer')
		await clickWaitMs('.icon.is-key', 1000)
	}
	dbg(promoContainer)

	const codeInputField = promoContainer.querySelector('input')
	const submitButton = promoContainer.querySelector('button')
	if (!codeInputField || !submitButton) {
		err('Not found input or submit button')
		return
	}

	const needKeysGames = Object.keys(needKeys)
	dbg('Нужны ключи для игр:', needKeysGames)

	for (const key of myKeys) {
		if (!needKeysGames.find(gameName => key.startsWith(gameName))) {
			dbg('Игнорирую ключ:', key)
			continue
		}

		dbg('Ввожу ключ:', key)
		codeInputField.value = key
		codeInputField.dispatchEvent(new Event('change'))
		codeInputField.dispatchEvent(new Event('input'))
		await waitMs(500)

		await clickWaitMs(submitButton, 5000)
	}
	await clickWaitMs('.icon.is-key', 1000)
}


async function getKeys() {
	const myName = await getMyName()
	let response
	const today = (new Date).toLocaleDateString()
	const url = `${gBot.keysUrl}?d=${today}&t=${(new Date).getHours()}`
	try {
		dbg('Fetching', url)
		response = await fetch(url)
		if (!response.ok) throw new Error('Ошибка HTTP:', response.status)
		const keys = await response.json()
		dbg('MyKeys:')
		dbg(keys[myName])
		return keys[myName]
	} catch (e) {
		err('Failed to fetch keys:')
		err(e)
		err(response)
		err(response.text())
	}
}

window.navigation.addEventListener("navigate", (event) => {
	const url = new URL(event.destination.url)

	if (url.href.includes('minigames') && !gTimers.minigame) {
		gTimers.minigame = setInterval(patchMiniGames, 1000)
	} else {
		clearInterval(gTimers.minigame)
		gTimers.minigame = null
	}			
})

function onStart(changes, observer) {
	if (gTimers.modal) return

	gTimers.modal = setTimeout(async () => {
		gTimers.modal = null
		// dbg('gTimers main:', gTimers.main, 'href:', location.href)
		if (autoCloseModal() && !gTimers.main) {
			gTimers.main = true
			console.clear()

			dbg('Started At:', gBot.startedAt.toLocaleString())
			clearTimeout(gTimers.restartOnFail)

			await getMyName()
			// await dailyReward()
			await runTask['youtubeWatch']()
			await runTask['checkKeys']()
			
			await autoGame()
			gTimers.main = setInterval(autoGame, 60 * 1000)
		} else if (!gTimers.main) {
			if (appInUseMobileMode()) {
				err('App loaded in use mobile mode. Restarting in 5 seconds')
				setTimeout(() => location.reload(), 5000)
				observer.disconnect()
			}
			if (!gTimers.restartOnFail) {
				dbg('Setting restart on fail timer after 1 hour')
				gTimers.restartOnFail = setTimeout(() => { if (!gTimers.main) { err('Start failed. Restarting'); autoRestart() } }, 60 * 60 * 1000) // Not started in 1 hour
			}
		}
	}, 1000)

	/*
	if (document.querySelector(startTaskElementSelector)) {
		// observer.disconnect()
		setTimeout(() => justStarted = false, 60000)
		autoGame()
		setInterval(autoCloseModal, 5000)		
	}
	*/
}

(new MutationObserver(onStart)).observe(document, {childList: true, subtree: true})
