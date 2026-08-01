--// SYNCH AI — Chat Client
--// LocalScript -> StarterPlayer > StarterPlayerScripts
--// Full redesign on the Synch design system: #0084FF signature blue,
--// #111B21 dark base, pill-shaped bars, rounded cards, gradient CTAs.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local AI_Request = ReplicatedStorage:WaitForChild("AI_Request")

local shiftHeld = false

--// State
local history = {}
local isWaiting = false
local msgCount = 0
local windowOpen = false
local currentChatId = 1
local chatSessions = {}
local currentBubbleSize = 60 -- declared early so hover handlers close over the real value

--==================================================
-- DESIGN TOKENS — Synch system
--==================================================
local C = {
	bg      = Color3.fromRGB(11, 17, 21),   -- deep base
	bg2     = Color3.fromRGB(17, 27, 33),   -- #111B21 synch dark (bars/header)
	bg3     = Color3.fromRGB(23, 35, 43),   -- cards / rows
	bg4     = Color3.fromRGB(31, 46, 56),   -- hover / active surface
	sidebar = Color3.fromRGB(13, 20, 25),

	accent      = Color3.fromRGB(0, 132, 255),  -- #0084FF signature blue
	accentLight = Color3.fromRGB(64, 168, 255),
	accentDim   = Color3.fromRGB(0, 92, 184),

	border     = Color3.fromRGB(30, 46, 56),
	borderBlue = Color3.fromRGB(0, 132, 255),

	text  = Color3.fromRGB(242, 246, 250),
	text2 = Color3.fromRGB(156, 172, 184),
	text3 = Color3.fromRGB(98, 114, 126),

	userBubble = Color3.fromRGB(0, 76, 148),
	aiBubble   = Color3.fromRGB(23, 35, 43),

	red    = Color3.fromRGB(255, 92, 92),
	yellow = Color3.fromRGB(255, 196, 64),
}

-- Radii scale
local R = {
	window = 28,
	panel  = 22,
	card   = 18,
	row    = 16,
	bubble = 18,
	pill   = 999,
}

local function tween(obj, props, t, style, dir)
	local tw = TweenService:Create(
		obj,
		TweenInfo.new(t or 0.25, style or Enum.EasingStyle.Quart, dir or Enum.EasingDirection.Out),
		props
	)
	tw:Play()
	return tw
end

local function make(class, props, parent)
	local obj = Instance.new(class)
	for k, v in pairs(props) do
		obj[k] = v
	end
	if parent then
		obj.Parent = parent
	end
	return obj
end

local function trim(s)
	return (s or ""):match("^%s*(.-)%s*$")
end

local function scrollToBottom(scrollFrame)
	task.wait()
	scrollFrame.CanvasPosition = Vector2.new(0, math.max(0, scrollFrame.AbsoluteCanvasSize.Y + 9999))
end

local function setCorner(obj, radius)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius)
	c.Parent = obj
	return c
end

local function setStroke(obj, color, thickness, transparency)
	local s = Instance.new("UIStroke")
	s.Color = color
	s.Thickness = thickness or 1
	s.Transparency = transparency or 0
	s.Parent = obj
	return s
end

local function setGradient(obj, colorA, colorB, rotation)
	local g = Instance.new("UIGradient")
	g.Color = ColorSequence.new(colorA, colorB)
	g.Rotation = rotation or 90
	g.Parent = obj
	return g
end

local function cloneTable(t)
	local new = {}
	for k, v in pairs(t) do
		new[k] = v
	end
	return new
end

local HoverTweens = {}

local function stopHoverTween(obj)
	local tw = HoverTweens[obj]
	if tw then
		pcall(function() tw:Cancel() end)
		HoverTweens[obj] = nil
	end
end

local function tweenHover(obj, props, t, style, dir)
	stopHoverTween(obj)
	local tw = TweenService:Create(obj, TweenInfo.new(t or 0.12, style or Enum.EasingStyle.Quart, dir or Enum.EasingDirection.Out), props)
	HoverTweens[obj] = tw
	tw:Play()
	tw.Completed:Connect(function()
		if HoverTweens[obj] == tw then
			HoverTweens[obj] = nil
		end
	end)
	return tw
end

--==================================================
-- GUI ROOT
--==================================================
local Gui = make("ScreenGui", {
	Name = "SYNCH_AI_UI",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
}, playerGui)

--==================================================
-- BUBBLE — gradient circular launcher
--==================================================
local Bubble = make("TextButton", {
	Name = "Bubble",
	Size = UDim2.new(0, 60, 0, 60),
	Position = UDim2.new(1, -84, 1, -96),
	BackgroundColor3 = C.accent,
	Text = "S",
	TextColor3 = Color3.new(1, 1, 1),
	Font = Enum.Font.GothamBold,
	TextSize = 22,
	BorderSizePixel = 0,
	AutoButtonColor = false,
	ZIndex = 100,
}, Gui)
setCorner(Bubble, R.pill)
setGradient(Bubble, C.accent, Color3.fromRGB(0, 60, 140), 120)
setStroke(Bubble, Color3.fromRGB(150, 205, 255), 2, 0.35)

local BubbleGlow = make("ImageLabel", {
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(1, 44, 1, 44),
	Image = "rbxassetid://5028857084",
	ImageColor3 = C.accent,
	ImageTransparency = 0.7,
	ZIndex = 99,
}, Bubble)

local dragging, dragStart, startPos, dragMoved = false, nil, nil, false

Bubble.InputBegan:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
		dragging = true
		dragMoved = false
		dragStart = input.Position
		startPos = Bubble.Position
		input.Changed:Connect(function()
			if input.UserInputState == Enum.UserInputState.End then
				dragging = false
			end
		end)
	end
end)

UserInputService.InputChanged:Connect(function(input)
	if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
		local delta = input.Position - dragStart
		if math.abs(delta.X) > 3 or math.abs(delta.Y) > 3 then
			dragMoved = true
		end
		Bubble.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
	end
end)

Bubble.MouseEnter:Connect(function()
	local size = currentBubbleSize or 60
	tweenHover(Bubble, {Size = UDim2.new(0, size + 4, 0, size + 4)}, 0.12)
end)

Bubble.MouseLeave:Connect(function()
	stopHoverTween(Bubble)
	local size = currentBubbleSize or 60
	tween(Bubble, {Size = UDim2.new(0, size, 0, size)}, 0.12)
end)

--==================================================
-- WINDOW
--==================================================
local EXPANDED_SIZE = UDim2.new(0, 900, 0, 560)
local EXPANDED_POS = UDim2.new(0.5, -450, 0.5, -280)

local Window = make("Frame", {
	Name = "Window",
	Size = UDim2.new(0, 60, 0, 60),
	Position = Bubble.Position,
	BackgroundColor3 = C.bg,
	BorderSizePixel = 0,
	Visible = false,
	ClipsDescendants = true,
	ZIndex = 10,
}, Gui)
setCorner(Window, R.window)
setStroke(Window, C.border, 1, 0.2)

local WindowScale = make("UIScale", { Scale = 1 }, Window)

local Shadow = make("ImageLabel", {
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(1, 70, 1, 70),
	Image = "rbxassetid://6015897843",
	ImageColor3 = Color3.new(0, 0, 0),
	ImageTransparency = 0.5,
	ScaleType = Enum.ScaleType.Slice,
	SliceCenter = Rect.new(49, 49, 450, 450),
	ZIndex = 9,
}, Window)

--==================================================
-- SIDEBAR
--==================================================
local Sidebar = make("Frame", {
	Name = "Sidebar",
	Size = UDim2.new(0, 220, 1, 0),
	BackgroundColor3 = C.sidebar,
	BorderSizePixel = 0,
	ZIndex = 11,
}, Window)
setCorner(Sidebar, R.window)

local SidebarFix = make("Frame", {
	Size = UDim2.new(0, R.window, 1, 0),
	Position = UDim2.new(1, -R.window, 0, 0),
	BackgroundColor3 = C.sidebar,
	BorderSizePixel = 0,
	ZIndex = 11,
}, Sidebar)

-- gradient CTA "New Chat" pill
local NewChatBtn = make("TextButton", {
	Size = UDim2.new(1, -32, 0, 48),
	Position = UDim2.new(0, 16, 0, 18),
	BackgroundColor3 = C.accent,
	Text = "+  New Chat",
	TextColor3 = Color3.new(1, 1, 1),
	Font = Enum.Font.GothamBold,
	TextSize = 15,
	BorderSizePixel = 0,
	AutoButtonColor = false,
	ZIndex = 12,
}, Sidebar)
setCorner(NewChatBtn, R.pill)
setGradient(NewChatBtn, C.accent, Color3.fromRGB(0, 70, 160), 100)

local HistoryList = make("ScrollingFrame", {
	Name = "HistoryList",
	Size = UDim2.new(1, -24, 1, -180),
	Position = UDim2.new(0, 12, 0, 82),
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 2,
	ScrollBarImageColor3 = C.accentDim,
	ZIndex = 12,
}, Sidebar)

make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, HistoryList)
make("UIPadding", { PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 4) }, HistoryList)

local BottomProfile = make("Frame", {
	Size = UDim2.new(1, -24, 0, 72),
	Position = UDim2.new(0, 12, 1, -84),
	BackgroundColor3 = C.bg3,
	BorderSizePixel = 0,
	ZIndex = 12,
}, Sidebar)
setCorner(BottomProfile, R.card)

local AvatarHolder = make("Frame", {
	Size = UDim2.new(0, 44, 0, 44),
	Position = UDim2.new(0, 12, 0.5, -22),
	BackgroundColor3 = C.bg,
	BorderSizePixel = 0,
	ZIndex = 13,
}, BottomProfile)
setCorner(AvatarHolder, R.pill)
local AvatarRing = setStroke(AvatarHolder, C.borderBlue, 2, 0.25)

local Avatar = make("ImageLabel", {
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundTransparency = 1,
	Image = "",
	ZIndex = 14,
}, AvatarHolder)
setCorner(Avatar, R.pill)

local thumb = Players:GetUserThumbnailAsync(player.UserId, Enum.ThumbnailType.HeadShot, Enum.ThumbnailSize.Size100x100)
Avatar.Image = thumb

local DisplayNameLabel = make("TextLabel", {
	Size = UDim2.new(0, 118, 0, 18),
	Position = UDim2.new(0, 64, 0, 14),
	BackgroundTransparency = 1,
	Text = player.DisplayName,
	TextColor3 = C.text,
	Font = Enum.Font.GothamBold,
	TextSize = 14,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextTruncate = Enum.TextTruncate.AtEnd,
	ZIndex = 13,
}, BottomProfile)

local UsernameLabel = make("TextLabel", {
	Size = UDim2.new(0, 118, 0, 16),
	Position = UDim2.new(0, 64, 0, 34),
	BackgroundTransparency = 1,
	Text = "@" .. player.Name,
	TextColor3 = C.text2,
	Font = Enum.Font.Gotham,
	TextSize = 12,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextTruncate = Enum.TextTruncate.AtEnd,
	ZIndex = 13,
}, BottomProfile)

local SettingsBtn = make("TextButton", {
	Size = UDim2.new(0, 36, 0, 36),
	Position = UDim2.new(1, -46, 0.5, -18),
	BackgroundColor3 = C.bg4,
	Text = "⚙",
	TextColor3 = C.text,
	Font = Enum.Font.GothamBold,
	TextSize = 16,
	BorderSizePixel = 0,
	AutoButtonColor = false,
	ZIndex = 13,
}, BottomProfile)
setCorner(SettingsBtn, R.pill)
setStroke(SettingsBtn, C.borderBlue, 1, 0.55)

--==================================================
-- MAIN PANEL
--==================================================
local Main = make("Frame", {
	Name = "Main",
	Size = UDim2.new(1, -220, 1, 0),
	Position = UDim2.new(0, 220, 0, 0),
	BackgroundColor3 = C.bg,
	BorderSizePixel = 0,
	ZIndex = 11,
}, Window)
setCorner(Main, R.window)

local TopBar = make("Frame", {
	Size = UDim2.new(1, 0, 0, 64),
	BackgroundColor3 = C.bg2,
	BorderSizePixel = 0,
	ZIndex = 12,
}, Main)
setCorner(TopBar, R.window)

local TopBarFix = make("Frame", {
	Size = UDim2.new(1, 0, 0, R.window),
	Position = UDim2.new(0, 0, 1, -R.window),
	BackgroundColor3 = C.bg2,
	BorderSizePixel = 0,
	ZIndex = 12,
}, TopBar)

local LogoDot = make("Frame", {
	Size = UDim2.new(0, 34, 0, 34),
	Position = UDim2.new(0, 18, 0.5, -17),
	BackgroundColor3 = C.accent,
	BorderSizePixel = 0,
	ZIndex = 13,
}, TopBar)
setCorner(LogoDot, R.pill)
setGradient(LogoDot, C.accent, Color3.fromRGB(0, 70, 160), 120)

local LogoText = make("TextLabel", {
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundTransparency = 1,
	Text = "S",
	TextColor3 = Color3.new(1, 1, 1),
	Font = Enum.Font.GothamBold,
	TextSize = 15,
	ZIndex = 14,
}, LogoDot)

local StatusDot = make("Frame", {
	Size = UDim2.new(0, 10, 0, 10),
	Position = UDim2.new(1, -3, 1, -3),
	AnchorPoint = Vector2.new(0.5, 0.5),
	BackgroundColor3 = Color3.fromRGB(72, 224, 140),
	BorderSizePixel = 0,
	ZIndex = 15,
}, LogoDot)
setCorner(StatusDot, R.pill)
setStroke(StatusDot, C.bg2, 2, 0)

local Title = make("TextLabel", {
	Size = UDim2.new(0, 220, 1, 0),
	Position = UDim2.new(0, 62, 0, 0),
	BackgroundTransparency = 1,
	Text = "Synch AI",
	TextColor3 = C.text,
	Font = Enum.Font.GothamBold,
	TextSize = 16,
	TextXAlignment = Enum.TextXAlignment.Left,
	ZIndex = 13,
}, TopBar)

local MsgCounter = make("TextLabel", {
	Size = UDim2.new(0, 60, 1, 0),
	Position = UDim2.new(1, -184, 0, 0),
	BackgroundTransparency = 1,
	Text = "0 msgs",
	TextColor3 = C.text3,
	Font = Enum.Font.Gotham,
	TextSize = 11,
	TextXAlignment = Enum.TextXAlignment.Right,
	ZIndex = 13,
}, TopBar)

local function topIconButton(iconText, xOffsetFromRight)
	local btn = make("TextButton", {
		Size = UDim2.new(0, 36, 0, 36),
		Position = UDim2.new(1, xOffsetFromRight, 0.5, -18),
		BackgroundColor3 = C.bg4,
		Text = iconText,
		TextColor3 = C.text2,
		Font = Enum.Font.GothamBold,
		TextSize = 13,
		BorderSizePixel = 0,
		AutoButtonColor = false,
		ZIndex = 13,
	}, TopBar)
	setCorner(btn, R.pill)
	setStroke(btn, C.borderBlue, 1, 0.6)
	return btn
end

local ClearBtn = topIconButton("🗑", -130)
local MinBtn = topIconButton("–", -84)
local CloseBtn = topIconButton("×", -38)

local ChatScroll = make("ScrollingFrame", {
	Size = UDim2.new(1, 0, 1, -128),
	Position = UDim2.new(0, 0, 0, 64),
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 3,
	ScrollBarImageColor3 = C.accentDim,
	ZIndex = 12,
}, Main)

make("UIPadding", {
	PaddingTop = UDim.new(0, 16),
	PaddingBottom = UDim.new(0, 16),
	PaddingLeft = UDim.new(0, 18),
	PaddingRight = UDim.new(0, 18),
}, ChatScroll)

make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, ChatScroll)

local EmptyLabel = make("TextLabel", {
	Size = UDim2.new(1, 0, 0, 120),
	BackgroundTransparency = 1,
	Text = "Ask Synch AI anything.",
	TextColor3 = C.text3,
	Font = Enum.Font.Gotham,
	TextSize = 14,
	TextWrapped = true,
	TextYAlignment = Enum.TextYAlignment.Center,
	ZIndex = 12,
}, ChatScroll)

local TypingFrame = make("Frame", {
	Size = UDim2.new(0, 120, 0, 38),
	BackgroundColor3 = C.aiBubble,
	BorderSizePixel = 0,
	Visible = false,
	ZIndex = 12,
}, ChatScroll)
setCorner(TypingFrame, R.bubble)
setStroke(TypingFrame, C.borderBlue, 1, 0.6)

local TypingLabel = make("TextLabel", {
	Size = UDim2.new(1, -16, 1, 0),
	Position = UDim2.new(0, 12, 0, 0),
	BackgroundTransparency = 1,
	Text = "Synch AI  •  •  •",
	TextColor3 = C.accentLight,
	Font = Enum.Font.GothamBold,
	TextSize = 12,
	TextXAlignment = Enum.TextXAlignment.Left,
	ZIndex = 13,
}, TypingFrame)

-- pill-shaped floating input bar
local InputArea = make("Frame", {
	Size = UDim2.new(1, -36, 0, 60),
	Position = UDim2.new(0, 18, 1, -76),
	BackgroundColor3 = C.bg3,
	BorderSizePixel = 0,
	ZIndex = 12,
}, Main)
setCorner(InputArea, R.pill)
setStroke(InputArea, C.borderBlue, 1, 0.65)

local InputBox = make("TextBox", {
	Size = UDim2.new(1, -76, 1, -12),
	Position = UDim2.new(0, 22, 0, 6),
	BackgroundTransparency = 1,
	PlaceholderText = "Message Synch AI...",
	PlaceholderColor3 = C.text3,
	Text = "",
	TextColor3 = C.text,
	Font = Enum.Font.Gotham,
	TextSize = 14,
	TextWrapped = true,
	MultiLine = true,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextYAlignment = Enum.TextYAlignment.Center,
	ClearTextOnFocus = false,
	ZIndex = 13,
}, InputArea)

local SendBtn = make("TextButton", {
	Size = UDim2.new(0, 44, 0, 44),
	Position = UDim2.new(1, -52, 0.5, -22),
	BackgroundColor3 = C.accent,
	Text = "➤",
	TextColor3 = Color3.new(1, 1, 1),
	Font = Enum.Font.GothamBold,
	TextSize = 16,
	BorderSizePixel = 0,
	AutoButtonColor = false,
	ZIndex = 13,
}, InputArea)
setCorner(SendBtn, R.pill)
setGradient(SendBtn, C.accent, Color3.fromRGB(0, 70, 160), 100)

--==================================================
-- SETTINGS PANEL
--==================================================
local SettingsPanel = make("Frame", {
	Name = "SettingsPanel",
	Size = UDim2.new(1, -28, 1, -28),
	Position = UDim2.new(0, 14, 0, 14),
	BackgroundColor3 = C.bg,
	BorderSizePixel = 0,
	Visible = false,
	ZIndex = 40,
}, Main)
setCorner(SettingsPanel, R.window)
setStroke(SettingsPanel, C.border, 1, 0.1)

local SettingsTop = make("Frame", {
	Size = UDim2.new(1, 0, 0, 60),
	BackgroundColor3 = C.bg2,
	BorderSizePixel = 0,
	ZIndex = 41,
}, SettingsPanel)
setCorner(SettingsTop, R.window)

local SettingsTopFix = make("Frame", {
	Size = UDim2.new(1, 0, 0, R.window),
	Position = UDim2.new(0, 0, 1, -R.window),
	BackgroundColor3 = C.bg2,
	BorderSizePixel = 0,
	ZIndex = 41,
}, SettingsTop)

local DropdownLayer = make("Frame", {
	Name = "DropdownLayer",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	ZIndex = 500,
	ClipsDescendants = false,
}, SettingsPanel)

local BackBtn = make("TextButton", {
	Size = UDim2.new(0, 92, 0, 36),
	Position = UDim2.new(0, 16, 0.5, -18),
	BackgroundColor3 = C.bg4,
	Text = "←  Back",
	TextColor3 = C.text,
	Font = Enum.Font.GothamBold,
	TextSize = 13,
	BorderSizePixel = 0,
	AutoButtonColor = false,
	ZIndex = 42,
}, SettingsTop)
setCorner(BackBtn, R.pill)
setStroke(BackBtn, C.borderBlue, 1, 0.6)

local SettingsTitle = make("TextLabel", {
	Size = UDim2.new(0, 240, 1, 0),
	Position = UDim2.new(0, 122, 0, 0),
	BackgroundTransparency = 1,
	Text = "Settings",
	TextColor3 = C.text,
	Font = Enum.Font.GothamBold,
	TextSize = 18,
	TextXAlignment = Enum.TextXAlignment.Left,
	ZIndex = 42,
}, SettingsTop)

local SettingsScroll = make("ScrollingFrame", {
	Size = UDim2.new(1, -28, 1, -80),
	Position = UDim2.new(0, 14, 0, 68),
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 2,
	ScrollBarImageColor3 = C.accentDim,
	ZIndex = 41,
}, SettingsPanel)

make("UIListLayout", { Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder }, SettingsScroll)
make("UIPadding", { PaddingBottom = UDim.new(0, 8) }, SettingsScroll)

--==================================================
-- SETTINGS STATE
--==================================================
local EnterToSend = true
local ClearConfirm = false
local PulseStatus = true

local currentAccentName = "Signature Blue"
local currentUIScale = 100
local currentSidebarWidth = 220
local currentMessageWidth = 80
local currentMessageCorner = R.bubble
local currentInputTextSize = 14

local messageBubbleRefs = {}
local historyItemRefs = {}
local historySelectedColor = C.bg4
local historyNormalColor = C.bg3
local historyHoverColor = Color3.fromRGB(38, 56, 68)

local function refreshMessageBubbleStyles()
	for _, info in ipairs(messageBubbleRefs) do
		if info.frame and info.frame.Parent then
			info.frame.Size = UDim2.new(currentMessageWidth / 100, 0, 0, 0)
			info.frame.Position = info.role == "user"
				and UDim2.new(1 - (currentMessageWidth / 100), 0, 0, 0)
				or UDim2.new(0, 0, 0, 0)
		end
		if info.corner then
			info.corner.CornerRadius = UDim.new(0, currentMessageCorner)
		end
	end
end

local openDropdown = nil

local function closeOpenDropdown()
	if openDropdown and openDropdown.frame and openDropdown.frame.Parent then
		openDropdown.isOpen = false
		if openDropdown.button then
			stopHoverTween(openDropdown.button)
			openDropdown.button.BackgroundColor3 = C.bg4
		end
		tween(openDropdown.frame, {Size = UDim2.new(0, openDropdown.width, 0, 0)}, 0.16)
		task.delay(0.16, function()
			if openDropdown and openDropdown.frame then
				openDropdown.frame.Visible = false
			end
		end)
	end
	openDropdown = nil
end

local function applyAccent(name)
	currentAccentName = name
	if name == "Signature Blue" then
		C.accent = Color3.fromRGB(0, 132, 255)
		C.accentLight = Color3.fromRGB(64, 168, 255)
	elseif name == "Ice Cyan" then
		C.accent = Color3.fromRGB(22, 194, 255)
		C.accentLight = Color3.fromRGB(120, 224, 255)
	elseif name == "Neon Violet" then
		C.accent = Color3.fromRGB(122, 92, 255)
		C.accentLight = Color3.fromRGB(170, 148, 255)
	end

	NewChatBtn.BackgroundColor3 = C.accent
	SendBtn.BackgroundColor3 = C.accent
	LogoDot.BackgroundColor3 = C.accent
	Bubble.BackgroundColor3 = C.accent
	BubbleGlow.ImageColor3 = C.accent
	TypingLabel.TextColor3 = C.accentLight

	for _, g in ipairs({NewChatBtn, SendBtn, LogoDot, Bubble}) do
		local grad = g:FindFirstChildOfClass("UIGradient")
		if grad then
			grad.Color = ColorSequence.new(C.accent, Color3.fromRGB(0, 70, 160))
		end
	end
end

local function applyUIScale(percent)
	currentUIScale = percent
	WindowScale.Scale = percent / 100
end

local function applySidebarWidth(width)
	currentSidebarWidth = width
	Sidebar.Size = UDim2.new(0, width, 1, 0)
	Main.Size = UDim2.new(1, -width, 1, 0)
	Main.Position = UDim2.new(0, width, 0, 0)
end

local function applyInputTextSize(size)
	currentInputTextSize = size
	InputBox.TextSize = size
end

local function applyBubbleSize(size)
	currentBubbleSize = size
	Bubble.Size = UDim2.new(0, size, 0, size)
	if not windowOpen then
		tween(Bubble, {Size = UDim2.new(0, size, 0, size)}, 0.12)
	end
end

local function applyPulse(enabled)
	PulseStatus = enabled
end

local function applyClearConfirm(enabled)
	ClearConfirm = enabled
end

local function applyEnterToSend(enabled)
	EnterToSend = enabled
end

local function createSettingRow(iconText, labelText)
	local row = make("Frame", {
		Size = UDim2.new(1, 0, 0, 54),
		BackgroundColor3 = C.bg3,
		BorderSizePixel = 0,
		ZIndex = 42,
	}, SettingsScroll)
	setCorner(row, R.row)
	setStroke(row, C.border, 1, 0.3)

	local icon = make("TextLabel", {
		Size = UDim2.new(0, 38, 0, 38),
		Position = UDim2.new(0, 10, 0.5, -19),
		BackgroundColor3 = C.bg4,
		Text = iconText,
		TextColor3 = C.text,
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		BorderSizePixel = 0,
		ZIndex = 43,
	}, row)
	setCorner(icon, R.pill)

	local label = make("TextLabel", {
		Size = UDim2.new(0.42, 0, 1, 0),
		Position = UDim2.new(0, 58, 0, 0),
		BackgroundTransparency = 1,
		Text = labelText,
		TextColor3 = C.text,
		Font = Enum.Font.Gotham,
		TextSize = 13,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 43,
	}, row)

	return row, label
end

local function createDropdownRow(iconText, labelText, options, initialValue, onSelect)
	local row = createSettingRow(iconText, labelText)
	local currentValue = initialValue
	local buttonWidth, buttonHeight = 190, 36

	local button = make("TextButton", {
		Size = UDim2.new(0, buttonWidth, 0, buttonHeight),
		Position = UDim2.new(1, -buttonWidth - 10, 0.5, -buttonHeight/2),
		BackgroundColor3 = C.bg4,
		Text = tostring(currentValue) .. "  ▾",
		TextColor3 = C.text2,
		Font = Enum.Font.Gotham,
		TextSize = 12,
		BorderSizePixel = 0,
		AutoButtonColor = false,
		ZIndex = 44,
	}, row)
	setCorner(button, R.pill)
	setStroke(button, C.borderBlue, 1, 0.65)

	local dropdown = make("Frame", {
		Size = UDim2.new(0, buttonWidth, 0, 0),
		BackgroundColor3 = C.bg2,
		BorderSizePixel = 0,
		Visible = false,
		ClipsDescendants = true,
		ZIndex = 501,
	}, DropdownLayer)
	setCorner(dropdown, R.card)
	setStroke(dropdown, C.border, 1, 0.1)

	make("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, dropdown)
	make("UIPadding", {
		PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6),
		PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6),
	}, dropdown)

	local state = { frame = dropdown, button = button, isOpen = false, width = buttonWidth }

	local function setValue(v)
		currentValue = v
		button.Text = tostring(v) .. "  ▾"
		onSelect(v)
	end

	local function placeDropdown()
		local absPos = button.AbsolutePosition
		local panelAbsPos = SettingsPanel.AbsolutePosition
		local scrollOffset = SettingsScroll.CanvasPosition.Y
		dropdown.Position = UDim2.new(
			0, absPos.X - panelAbsPos.X,
			0, absPos.Y - panelAbsPos.Y + button.AbsoluteSize.Y + 4 + scrollOffset
		)
	end

	for _, option in ipairs(options) do
		local opt = make("TextButton", {
			Size = UDim2.new(1, 0, 0, 32),
			BackgroundColor3 = C.bg3,
			Text = tostring(option),
			TextColor3 = C.text2,
			Font = Enum.Font.Gotham,
			TextSize = 12,
			BorderSizePixel = 0,
			AutoButtonColor = false,
			ZIndex = 502,
		}, dropdown)
		setCorner(opt, R.row - 4)

		opt.MouseEnter:Connect(function()
			tweenHover(opt, {BackgroundColor3 = C.bg4, TextColor3 = C.text}, 0.12)
		end)
		opt.MouseLeave:Connect(function()
			stopHoverTween(opt)
			opt.BackgroundColor3 = C.bg3
			opt.TextColor3 = C.text2
		end)
		opt.MouseButton1Click:Connect(function()
			setValue(option)
			closeOpenDropdown()
		end)
	end

	button.MouseButton1Click:Connect(function()
		if openDropdown and openDropdown ~= state then
			closeOpenDropdown()
		end
		if state.isOpen then
			closeOpenDropdown()
			return
		end
		placeDropdown()
		state.isOpen = true
		openDropdown = state
		stopHoverTween(button)
		button.BackgroundColor3 = C.bg4
		dropdown.Visible = true
		dropdown.Size = UDim2.new(0, buttonWidth, 0, 0)
		local targetHeight = 12 + (#options * 32) + ((#options - 1) * 4)
		tween(dropdown, {Size = UDim2.new(0, buttonWidth, 0, targetHeight)}, 0.16)
	end)

	return { row = row, button = button, setValue = setValue }
end

local function createToggleRow(iconText, labelText, initialValue, onChanged)
	local row = createSettingRow(iconText, labelText)
	local value = initialValue

	local toggle = make("TextButton", {
		Size = UDim2.new(0, 64, 0, 30),
		Position = UDim2.new(1, -76, 0.5, -15),
		BackgroundColor3 = value and C.accent or C.bg4,
		Text = "",
		BorderSizePixel = 0,
		AutoButtonColor = false,
		ZIndex = 44,
	}, row)
	setCorner(toggle, R.pill)

	local knob = make("Frame", {
		Size = UDim2.new(0, 24, 0, 24),
		Position = value and UDim2.new(1, -27, 0.5, -12) or UDim2.new(0, 3, 0.5, -12),
		BackgroundColor3 = Color3.new(1, 1, 1),
		BorderSizePixel = 0,
		ZIndex = 45,
	}, toggle)
	setCorner(knob, R.pill)

	local function setValue(v)
		value = v
		toggle.BackgroundColor3 = value and C.accent or C.bg4
		tween(knob, {Position = value and UDim2.new(1, -27, 0.5, -12) or UDim2.new(0, 3, 0.5, -12)}, 0.16)
		onChanged(v)
	end

	toggle.MouseButton1Click:Connect(function() setValue(not value) end)
	return { row = row, setValue = setValue }
end

local function createSliderRow(iconText, labelText, minValue, maxValue, initialValue, suffix, onChanged)
	local row = createSettingRow(iconText, labelText)

	local valueLabel = make("TextLabel", {
		Size = UDim2.new(0, 46, 0, 20),
		Position = UDim2.new(1, -226, 0.5, -10),
		BackgroundTransparency = 1,
		Text = tostring(initialValue) .. suffix,
		TextColor3 = C.text2,
		Font = Enum.Font.Gotham,
		TextSize = 12,
		TextXAlignment = Enum.TextXAlignment.Right,
		ZIndex = 44,
	}, row)

	local track = make("Frame", {
		Size = UDim2.new(0, 160, 0, 6),
		Position = UDim2.new(1, -176, 0.5, -3),
		BackgroundColor3 = C.bg4,
		BorderSizePixel = 0,
		ZIndex = 44,
	}, row)
	setCorner(track, R.pill)

	local fill = make("Frame", {
		Size = UDim2.new((initialValue - minValue) / (maxValue - minValue), 0, 1, 0),
		BackgroundColor3 = C.accent,
		BorderSizePixel = 0,
		ZIndex = 45,
	}, track)
	setCorner(fill, R.pill)

	local knob = make("Frame", {
		Size = UDim2.new(0, 14, 0, 14),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new((initialValue - minValue) / (maxValue - minValue), 0, 0.5, 0),
		BackgroundColor3 = Color3.new(1, 1, 1),
		BorderSizePixel = 0,
		ZIndex = 46,
	}, track)
	setCorner(knob, R.pill)

	local draggingSlider = false
	local currentValue = initialValue

	local function setValue(v)
		v = math.clamp(math.floor(v + 0.5), minValue, maxValue)
		currentValue = v
		local alpha = (v - minValue) / (maxValue - minValue)
		fill.Size = UDim2.new(alpha, 0, 1, 0)
		knob.Position = UDim2.new(alpha, 0, 0.5, 0)
		valueLabel.Text = tostring(v) .. suffix
		onChanged(v)
	end

	local function updateFromInput(input)
		local left = track.AbsolutePosition.X
		local width = track.AbsoluteSize.X
		local alpha = math.clamp((input.Position.X - left) / width, 0, 1)
		setValue(minValue + ((maxValue - minValue) * alpha))
	end

	track.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			draggingSlider = true
			updateFromInput(input)
		end
	end)
	track.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			draggingSlider = false
		end
	end)
	UserInputService.InputChanged:Connect(function(input)
		if draggingSlider and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
			updateFromInput(input)
		end
	end)

	return { row = row, setValue = setValue, getValue = function() return currentValue end }
end

--==================================================
-- SETTINGS CONTROLS
--==================================================
createDropdownRow("✦", "Accent", {"Signature Blue", "Ice Cyan", "Neon Violet"}, "Signature Blue", applyAccent)
createSliderRow("⌗", "UI Scale", 85, 115, 100, "%", applyUIScale)
createSliderRow("▥", "Sidebar Width", 190, 260, 220, "px", applySidebarWidth)
createSliderRow("▤", "Message Width", 72, 92, 80, "%", function(v)
	currentMessageWidth = v
	refreshMessageBubbleStyles()
end)
createSliderRow("◩", "Message Corners", 10, 26, R.bubble, "px", function(v)
	currentMessageCorner = v
	refreshMessageBubbleStyles()
end)
createSliderRow("A", "Input Size", 12, 18, 14, "px", applyInputTextSize)
createSliderRow("◎", "Bubble Size", 52, 76, 60, "px", applyBubbleSize)
createToggleRow("↵", "Enter To Send", true, applyEnterToSend)
createToggleRow("🗑", "Clear Confirm", false, applyClearConfirm)
createToggleRow("●", "Status Pulse", true, applyPulse)

local BubbleResetRow = createSettingRow("⌂", "Reset Bubble Position")
local BubbleResetBtn = make("TextButton", {
	Size = UDim2.new(0, 116, 0, 36),
	Position = UDim2.new(1, -126, 0.5, -18),
	BackgroundColor3 = C.bg4,
	Text = "Reset",
	TextColor3 = C.text2,
	Font = Enum.Font.GothamBold,
	TextSize = 12,
	BorderSizePixel = 0,
	AutoButtonColor = false,
	ZIndex = 44,
}, BubbleResetRow)
setCorner(BubbleResetBtn, R.pill)
setStroke(BubbleResetBtn, C.borderBlue, 1, 0.65)

--==================================================
-- HISTORY ITEMS
--==================================================
local function createChatItem(id, titleText)
	local btn = make("TextButton", {
		Name = "Chat_" .. tostring(id),
		Size = UDim2.new(1, 0, 0, 46),
		BackgroundColor3 = historyNormalColor,
		Text = "",
		BorderSizePixel = 0,
		AutoButtonColor = false,
		ZIndex = 12,
	}, HistoryList)
	setCorner(btn, R.row)

	make("TextLabel", {
		Size = UDim2.new(1, -20, 1, 0),
		Position = UDim2.new(0, 12, 0, 0),
		BackgroundTransparency = 1,
		Text = titleText,
		TextColor3 = C.text2,
		Font = Enum.Font.Gotham,
		TextSize = 12,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Center,
		ZIndex = 14,
	}, btn)

	table.insert(historyItemRefs, { id = id, button = btn })

	btn.MouseEnter:Connect(function()
		if currentChatId ~= id then
			tweenHover(btn, {BackgroundColor3 = historyHoverColor}, 0.12)
		end
	end)
	btn.MouseLeave:Connect(function()
		stopHoverTween(btn)
		btn.BackgroundColor3 = (currentChatId == id) and historySelectedColor or historyNormalColor
	end)

	btn.MouseButton1Click:Connect(function()
		currentChatId = id
		for _, child in ipairs(HistoryList:GetChildren()) do
			if child:IsA("TextButton") then
				child.BackgroundColor3 = historyNormalColor
			end
		end
		btn.BackgroundColor3 = historySelectedColor

		history = cloneTable(chatSessions[id].history or {})
		msgCount = 0
		messageBubbleRefs = {}

		for _, c in ipairs(ChatScroll:GetChildren()) do
			if c:IsA("Frame") and c ~= TypingFrame then
				c:Destroy()
			end
		end

		EmptyLabel.Visible = #history == 0
		MsgCounter.Text = tostring(#history) .. " msg" .. (#history == 1 and "" or "s")

		for _, msg in ipairs(history) do
			local role = msg.role == "assistant" and "assistant" or "user"
			msgCount += 1

			local wrapper = make("Frame", {
				Size = UDim2.new(1, 0, 0, 0),
				AutomaticSize = Enum.AutomaticSize.Y,
				BackgroundTransparency = 1,
				LayoutOrder = msgCount,
				ZIndex = 12,
			}, ChatScroll)

			local bubble = make("Frame", {
				Size = UDim2.new(currentMessageWidth / 100, 0, 0, 0),
				Position = role == "user" and UDim2.new(1 - (currentMessageWidth / 100), 0, 0, 0) or UDim2.new(0, 0, 0, 0),
				AutomaticSize = Enum.AutomaticSize.Y,
				BackgroundColor3 = role == "user" and C.userBubble or C.aiBubble,
				BorderSizePixel = 0,
				ZIndex = 12,
			}, wrapper)
			local bubbleCorner = setCorner(bubble, currentMessageCorner)
			setStroke(bubble, role == "user" and C.borderBlue or C.border, 1, role == "user" and 0.6 or 0.2)

			make("UIPadding", {
				PaddingTop = UDim.new(0, 10), PaddingBottom = UDim.new(0, 10),
				PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14),
			}, bubble)
			make("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 4) }, bubble)

			make("TextLabel", {
				Size = UDim2.new(1, 0, 0, 16),
				BackgroundTransparency = 1,
				Text = role == "user" and "You" or "Synch AI",
				TextColor3 = role == "user" and Color3.fromRGB(190, 220, 255) or C.accentLight,
				Font = Enum.Font.GothamBold,
				TextSize = 10,
				TextXAlignment = Enum.TextXAlignment.Left,
				ZIndex = 13,
			}, bubble)

			make("TextLabel", {
				Size = UDim2.new(1, 0, 0, 0),
				AutomaticSize = Enum.AutomaticSize.Y,
				BackgroundTransparency = 1,
				Text = msg.content or "",
				TextColor3 = C.text,
				Font = Enum.Font.Gotham,
				TextSize = 13,
				TextWrapped = true,
				TextXAlignment = Enum.TextXAlignment.Left,
				ZIndex = 13,
			}, bubble)

			table.insert(messageBubbleRefs, { frame = bubble, corner = bubbleCorner, role = role })
		end

		refreshMessageBubbleStyles()
		scrollToBottom(ChatScroll)
	end)

	return btn
end

local function refreshChatItems()
	historyItemRefs = {}
	for _, child in ipairs(HistoryList:GetChildren()) do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	for id, session in pairs(chatSessions) do
		local btn = createChatItem(id, session.title or ("Chat " .. id))
		if currentChatId == id then
			btn.BackgroundColor3 = historySelectedColor
		end
	end
end

local function ensureCurrentSession()
	if not chatSessions[currentChatId] then
		chatSessions[currentChatId] = { title = "New Chat", history = {} }
		refreshChatItems()
	end
end

ensureCurrentSession()

--==================================================
-- MESSAGES
--==================================================
local function setButtonState(loading)
	if loading then
		SendBtn.Text = "…"
		SendBtn.TextColor3 = C.text2
		SendBtn.Active = false
	else
		SendBtn.Text = "➤"
		SendBtn.TextColor3 = Color3.new(1, 1, 1)
		SendBtn.Active = true
	end
end

local function addMessage(role, text)
	msgCount += 1
	EmptyLabel.Visible = false
	MsgCounter.Text = tostring(msgCount) .. " msg" .. (msgCount == 1 and "" or "s")

	local isUser = role == "user"

	local wrapper = make("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = msgCount,
		ZIndex = 12,
	}, ChatScroll)

	local bubble = make("Frame", {
		Size = UDim2.new(currentMessageWidth / 100, 0, 0, 0),
		Position = isUser and UDim2.new(1 - (currentMessageWidth / 100), 0, 0, 0) or UDim2.new(0, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = isUser and C.userBubble or C.aiBubble,
		BorderSizePixel = 0,
		ZIndex = 12,
	}, wrapper)
	local bubbleCorner = setCorner(bubble, currentMessageCorner)
	setStroke(bubble, isUser and C.borderBlue or C.border, 1, isUser and 0.6 or 0.2)

	make("UIPadding", {
		PaddingTop = UDim.new(0, 10), PaddingBottom = UDim.new(0, 10),
		PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14),
	}, bubble)
	make("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 4) }, bubble)

	make("TextLabel", {
		Size = UDim2.new(1, 0, 0, 16),
		BackgroundTransparency = 1,
		Text = isUser and "You" or "Synch AI",
		TextColor3 = isUser and Color3.fromRGB(190, 220, 255) or C.accentLight,
		Font = Enum.Font.GothamBold,
		TextSize = 10,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 13,
	}, bubble)

	make("TextLabel", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Text = text,
		TextColor3 = C.text,
		Font = Enum.Font.Gotham,
		TextSize = 13,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 13,
	}, bubble)

	table.insert(messageBubbleRefs, { frame = bubble, corner = bubbleCorner, role = role })

	ensureCurrentSession()
	table.insert(chatSessions[currentChatId].history, {
		role = role == "assistant" and "assistant" or "user",
		content = text,
	})

	if chatSessions[currentChatId].title == "New Chat" and role == "user" then
		local short = text
		if #short > 22 then short = string.sub(short, 1, 22) .. "..." end
		chatSessions[currentChatId].title = short
		refreshChatItems()
	end

	refreshMessageBubbleStyles()
	scrollToBottom(ChatScroll)
end

local function reallyClearCurrentChat()
	history = {}
	msgCount = 0
	messageBubbleRefs = {}
	MsgCounter.Text = "0 msgs"

	for _, c in ipairs(ChatScroll:GetChildren()) do
		if c:IsA("Frame") and c ~= TypingFrame then
			c:Destroy()
		end
	end

	TypingFrame.Visible = false
	EmptyLabel.Visible = true

	chatSessions[currentChatId] = { title = "New Chat", history = {} }
	refreshChatItems()
	scrollToBottom(ChatScroll)
end

local function sendMessage()
	if isWaiting then return end

	local text = trim(InputBox.Text)
	if text == "" then return end

	InputBox.Text = ""
	addMessage("user", text)
	table.insert(history, { role = "user", content = text })

	isWaiting = true
	setButtonState(true)
	TypingFrame.Visible = true
	TypingFrame.LayoutOrder = 99999
	scrollToBottom(ChatScroll)

	local dotAnim = true
	local dots = { "Synch AI  •", "Synch AI  • •", "Synch AI  • • •" }
	local di = 1

	task.spawn(function()
		while dotAnim do
			TypingLabel.Text = dots[di]
			di = (di % 3) + 1
			task.wait(0.35)
		end
	end)

	task.spawn(function()
		-- Note: no proxy URL sent from client — the server decides where to send this.
		local ok, result = pcall(function()
			return AI_Request:InvokeServer(history)
		end)

		dotAnim = false
		TypingFrame.Visible = false
		isWaiting = false
		setButtonState(false)

		local reply = ok and result or ("Failed: " .. tostring(result))
		table.insert(history, { role = "assistant", content = reply })
		addMessage("assistant", reply)
	end)
end

--==================================================
-- OPEN / CLOSE / MINIMIZE
--==================================================
local function openWindow()
	if windowOpen then return end
	windowOpen = true
	Window.Visible = true
	Window.Position = Bubble.Position
	Window.Size = UDim2.new(0, currentBubbleSize, 0, currentBubbleSize)
	Window.BackgroundTransparency = 0

	Bubble.Visible = false
	Sidebar.Visible = false
	Main.Visible = false

	tween(Window, {Position = EXPANDED_POS, Size = EXPANDED_SIZE}, 0.38, Enum.EasingStyle.Back, Enum.EasingDirection.Out)

	task.delay(0.12, function()
		Sidebar.Visible = true
		Main.Visible = true
	end)
end

local function minimizeToBubble()
	if not windowOpen then return end
	closeOpenDropdown()

	windowOpen = false
	SettingsPanel.Visible = false
	Sidebar.Visible = false
	Main.Visible = false

	local tw = tween(Window, {
		Position = Bubble.Position,
		Size = UDim2.new(0, currentBubbleSize, 0, currentBubbleSize),
	}, 0.28, Enum.EasingStyle.Quart, Enum.EasingDirection.InOut)

	tw.Completed:Wait()
	Window.Visible = false
	Bubble.Visible = true
end

Bubble.MouseButton1Click:Connect(function()
	if dragMoved then dragMoved = false; return end
	openWindow()
end)

MinBtn.MouseButton1Click:Connect(minimizeToBubble)
CloseBtn.MouseButton1Click:Connect(minimizeToBubble)
SendBtn.MouseButton1Click:Connect(sendMessage)

UserInputService.InputBegan:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.LeftShift or input.KeyCode == Enum.KeyCode.RightShift then
		shiftHeld = true
	end
end)
UserInputService.InputEnded:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.LeftShift or input.KeyCode == Enum.KeyCode.RightShift then
		shiftHeld = false
	end
end)

InputBox:GetPropertyChangedSignal("Text"):Connect(function()
	if not InputBox:IsFocused() then return end
	if string.sub(InputBox.Text, -1) == "\n" then
		if EnterToSend and not shiftHeld then
			InputBox.Text = string.sub(InputBox.Text, 1, -2)
			sendMessage()
		end
	end
end)

ClearBtn.MouseButton1Click:Connect(function()
	if ClearConfirm then
		if ClearBtn:GetAttribute("ConfirmPending") then
			ClearBtn:SetAttribute("ConfirmPending", false)
			ClearBtn.Text = "🗑"
			reallyClearCurrentChat()
		else
			ClearBtn:SetAttribute("ConfirmPending", true)
			ClearBtn.Text = "Sure?"
			task.delay(1.1, function()
				if ClearBtn and ClearBtn.Parent then
					ClearBtn:SetAttribute("ConfirmPending", false)
					ClearBtn.Text = "🗑"
				end
			end)
		end
	else
		reallyClearCurrentChat()
	end
end)

NewChatBtn.MouseButton1Click:Connect(function()
	currentChatId += 1
	history = {}
	msgCount = 0
	messageBubbleRefs = {}
	MsgCounter.Text = "0 msgs"

	for _, c in ipairs(ChatScroll:GetChildren()) do
		if c:IsA("Frame") and c ~= TypingFrame then
			c:Destroy()
		end
	end

	TypingFrame.Visible = false
	EmptyLabel.Visible = true

	chatSessions[currentChatId] = { title = "New Chat", history = {} }
	refreshChatItems()
	scrollToBottom(ChatScroll)
end)

SettingsBtn.MouseButton1Click:Connect(function()
	SettingsPanel.Visible = true
end)

BackBtn.MouseButton1Click:Connect(function()
	closeOpenDropdown()
	SettingsPanel.Visible = false
end)

BubbleResetBtn.MouseButton1Click:Connect(function()
	Bubble.Position = UDim2.new(1, -84, 1, -96)
end)

--==================================================
-- HOVER
--==================================================
local function bindHover(btn, inProps, outProps)
	btn.MouseEnter:Connect(function() tweenHover(btn, inProps, 0.12) end)
	btn.MouseLeave:Connect(function()
		stopHoverTween(btn)
		for k, v in pairs(outProps) do btn[k] = v end
	end)
end

bindHover(SettingsBtn, {BackgroundColor3 = C.bg3}, {BackgroundColor3 = C.bg4})
bindHover(ClearBtn, {BackgroundColor3 = Color3.fromRGB(48, 24, 24), TextColor3 = C.red}, {BackgroundColor3 = C.bg4, TextColor3 = C.text2})
bindHover(MinBtn, {BackgroundColor3 = Color3.fromRGB(50, 42, 18), TextColor3 = C.yellow}, {BackgroundColor3 = C.bg4, TextColor3 = C.text2})
bindHover(CloseBtn, {BackgroundColor3 = C.red, TextColor3 = Color3.new(1, 1, 1)}, {BackgroundColor3 = C.bg4, TextColor3 = C.text2})
bindHover(BackBtn, {BackgroundColor3 = C.bg3}, {BackgroundColor3 = C.bg4})
bindHover(BubbleResetBtn, {BackgroundColor3 = C.bg3, TextColor3 = C.text}, {BackgroundColor3 = C.bg4, TextColor3 = C.text2})
bindHover(NewChatBtn, {BackgroundTransparency = 0.05}, {BackgroundTransparency = 0})
bindHover(SendBtn, {BackgroundTransparency = 0.05}, {BackgroundTransparency = 0})

--==================================================
-- PULSE
--==================================================
task.spawn(function()
	while true do
		if PulseStatus then
			tween(StatusDot, {BackgroundColor3 = Color3.fromRGB(140, 255, 190)}, 1.1, Enum.EasingStyle.Sine)
			task.wait(1.1)
			tween(StatusDot, {BackgroundColor3 = Color3.fromRGB(72, 224, 140)}, 1.1, Enum.EasingStyle.Sine)
			task.wait(1.1)
		else
			StatusDot.BackgroundColor3 = Color3.fromRGB(72, 224, 140)
			task.wait(0.4)
		end
	end
end)

--==================================================
-- INIT
--==================================================
refreshChatItems()
applyAccent("Signature Blue")
applyUIScale(100)
applySidebarWidth(220)
applyInputTextSize(14)
applyBubbleSize(60)
applyPulse(true)
applyClearConfirm(false)
applyEnterToSend(true)
refreshMessageBubbleStyles()

print("Synch AI client loaded")
