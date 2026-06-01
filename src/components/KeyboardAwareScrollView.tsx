import React, {
    createContext,
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Dimensions,
    Keyboard,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
    type ScrollViewProps,
    type TextInputProps,
    type ViewStyle,
} from 'react-native';

type FieldScrollOptions = {
    gapAboveKeyboard?: number;
    /** Target distance from screen top for the focused field block (default 120). */
    fieldTopOffset?: number;
    /** Extra pixels above the input when no {@link KeyboardField} wrapper is used (default 52). */
    includeLabelAbove?: number;
    /** When true, the measured ref already includes the label (via KeyboardField). */
    measureFullBlock?: boolean;
};

type KeyboardScrollContextValue = {
    scrollRef: React.RefObject<ScrollView | null>;
    scrollYRef: React.MutableRefObject<number>;
    keyboardHeight: number;
    registerFocusedField: (ref: React.RefObject<View | null>, options?: FieldScrollOptions) => void;
    unregisterFocusedField: (ref: React.RefObject<View | null>) => void;
    scrollFieldIntoView: (ref: React.RefObject<View | null>, options?: FieldScrollOptions) => void;
};

const KeyboardFieldContext = createContext<React.RefObject<View | null> | null>(null);

const DEFAULT_GAP_ABOVE_KEYBOARD = 16;
const DEFAULT_FIELD_TOP_OFFSET = 120;
const DEFAULT_LABEL_ABOVE = 56;

const KeyboardScrollContext = createContext<KeyboardScrollContextValue | null>(null);

type KeyboardAwareScrollViewProps = ScrollViewProps & {
    /** Base padding when keyboard is hidden (default 48). */
    bottomPadding?: number;
};

function scrollFieldIntoViewImpl(
    scrollRef: React.RefObject<ScrollView | null>,
    scrollYRef: React.MutableRefObject<number>,
    keyboardHeight: number,
    wrapperRef: React.RefObject<View | null>,
    options: FieldScrollOptions = {}
) {
    const gapAboveKeyboard = options.gapAboveKeyboard ?? DEFAULT_GAP_ABOVE_KEYBOARD;
    const fieldTopOffset = options.fieldTopOffset ?? DEFAULT_FIELD_TOP_OFFSET;
    const includeLabelAbove = options.measureFullBlock
        ? 0
        : (options.includeLabelAbove ?? DEFAULT_LABEL_ABOVE);

    if (!scrollRef.current || !wrapperRef.current) return;

    wrapperRef.current.measureInWindow((_x, y, _w, h) => {
        const windowHeight = Dimensions.get('window').height;
        const kbHeight = keyboardHeight > 0 ? keyboardHeight : 336;
        const visibleBottom = windowHeight - kbHeight - gapAboveKeyboard;

        const fieldTop = y - includeLabelAbove;
        const fieldBottom = y + h;

        let delta = 0;

        if (fieldBottom > visibleBottom) {
            delta = Math.max(delta, fieldBottom - visibleBottom);
        }

        if (fieldTop > fieldTopOffset) {
            delta = Math.max(delta, fieldTop - fieldTopOffset);
        }

        if (delta > 0) {
            scrollRef.current?.scrollTo({
                y: scrollYRef.current + delta,
                animated: true,
            });
        }
    });
}

/**
 * Wrap a label + input block so keyboard scroll keeps the whole field visible.
 * Place labels inside this wrapper, above {@link ScrollInputField}.
 */
export function KeyboardField({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
    const ref = useRef<View>(null);
    const fieldRef = useMemo(() => ref, []);

    return (
        <KeyboardFieldContext.Provider value={fieldRef}>
            <View ref={ref} style={style} collapsable={false}>
                {children}
            </View>
        </KeyboardFieldContext.Provider>
    );
}

/**
 * ScrollView with keyboard inset padding. Pair inputs with {@link ScrollInputField}
 * inside {@link KeyboardField} when the field has a label.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
    function KeyboardAwareScrollView(
        { bottomPadding = 48, style, contentContainerStyle, children, onScroll, ...scrollProps },
        ref
    ) {
        const scrollRef = useRef<ScrollView>(null);
        const scrollYRef = useRef(0);
        const [keyboardHeight, setKeyboardHeight] = useState(0);
        const activeFieldRef = useRef<{
            ref: React.RefObject<View | null>;
            options: FieldScrollOptions;
        } | null>(null);

        useImperativeHandle(ref, () => scrollRef.current as ScrollView);

        const scrollFieldIntoView = useCallback(
            (wrapperRef: React.RefObject<View | null>, options: FieldScrollOptions = {}) => {
                scrollFieldIntoViewImpl(scrollRef, scrollYRef, keyboardHeight, wrapperRef, options);
            },
            [keyboardHeight]
        );

        const registerFocusedField = useCallback(
            (wrapperRef: React.RefObject<View | null>, options: FieldScrollOptions = {}) => {
                activeFieldRef.current = { ref: wrapperRef, options };
            },
            []
        );

        const unregisterFocusedField = useCallback((wrapperRef: React.RefObject<View | null>) => {
            if (activeFieldRef.current?.ref === wrapperRef) {
                activeFieldRef.current = null;
            }
        }, []);

        useEffect(() => {
            const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
            const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

            const showSub = Keyboard.addListener(showEvent, (e) => {
                setKeyboardHeight(e.endCoordinates.height);
            });
            const hideSub = Keyboard.addListener(hideEvent, () => {
                setKeyboardHeight(0);
            });

            return () => {
                showSub.remove();
                hideSub.remove();
            };
        }, []);

        useEffect(() => {
            if (keyboardHeight <= 0 || !activeFieldRef.current) return;

            const delay = Platform.OS === 'ios' ? 50 : 100;
            const timer = setTimeout(() => {
                if (!activeFieldRef.current) return;
                scrollFieldIntoViewImpl(
                    scrollRef,
                    scrollYRef,
                    keyboardHeight,
                    activeFieldRef.current.ref,
                    activeFieldRef.current.options
                );
            }, delay);

            return () => clearTimeout(timer);
        }, [keyboardHeight, registerFocusedField, unregisterFocusedField, scrollFieldIntoView]);

        const mergedContentStyle = useMemo(
            () =>
                StyleSheet.flatten([
                    contentContainerStyle,
                    { paddingBottom: bottomPadding + keyboardHeight },
                ]),
            [contentContainerStyle, bottomPadding, keyboardHeight]
        );

        const ctx = useMemo<KeyboardScrollContextValue>(
            () => ({
                scrollRef,
                scrollYRef,
                keyboardHeight,
                registerFocusedField,
                unregisterFocusedField,
                scrollFieldIntoView,
            }),
            [keyboardHeight, registerFocusedField, unregisterFocusedField, scrollFieldIntoView]
        );

        return (
            <KeyboardScrollContext.Provider value={ctx}>
                <ScrollView
                    ref={scrollRef}
                    style={style}
                    contentContainerStyle={mergedContentStyle}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                    onScroll={(e) => {
                        scrollYRef.current = e.nativeEvent.contentOffset.y;
                        onScroll?.(e);
                    }}
                    scrollEventThrottle={16}
                    {...scrollProps}
                >
                    {children}
                </ScrollView>
            </KeyboardScrollContext.Provider>
        );
    }
);

type ScrollInputFieldProps = FieldScrollOptions & {
    children: React.ReactElement<TextInputProps>;
    style?: ViewStyle;
};

function scheduleScroll(
    ctx: KeyboardScrollContextValue,
    measureRef: React.RefObject<View | null>,
    options: FieldScrollOptions
) {
    const delay = Platform.OS === 'ios' ? 280 : 360;
    setTimeout(() => {
        ctx.scrollFieldIntoView(measureRef, options);
    }, delay);
}

/** Wrap a TextInput so it scrolls above the keyboard when focused. */
export function ScrollInputField({
    children,
    style,
    gapAboveKeyboard = DEFAULT_GAP_ABOVE_KEYBOARD,
    fieldTopOffset = DEFAULT_FIELD_TOP_OFFSET,
    includeLabelAbove,
}: ScrollInputFieldProps) {
    const ctx = useContext(KeyboardScrollContext);
    const fieldBlockRef = useContext(KeyboardFieldContext);
    const wrapperRef = useRef<View>(null);
    const measureRef = fieldBlockRef ?? wrapperRef;
    const measureFullBlock = !!fieldBlockRef;

    const options = useMemo(
        () => ({
            gapAboveKeyboard,
            fieldTopOffset,
            includeLabelAbove,
            measureFullBlock,
        }),
        [gapAboveKeyboard, fieldTopOffset, includeLabelAbove, measureFullBlock]
    );

    const handleFocus: TextInputProps['onFocus'] = (e) => {
        children.props.onFocus?.(e);
        if (!ctx) return;

        ctx.registerFocusedField(measureRef, options);
        scheduleScroll(ctx, measureRef, options);
    };

    const handleBlur: TextInputProps['onBlur'] = (e) => {
        children.props.onBlur?.(e);
        ctx?.unregisterFocusedField(measureRef);
    };

    return (
        <View ref={wrapperRef} style={style}>
            {React.cloneElement(children, { onFocus: handleFocus, onBlur: handleBlur })}
        </View>
    );
}

/** TextInput that auto-scrolls when used inside {@link KeyboardAwareScrollView}. */
export const KeyboardAwareTextInput = forwardRef<TextInput, TextInputProps & FieldScrollOptions>(
    function KeyboardAwareTextInput(
        { gapAboveKeyboard, fieldTopOffset, includeLabelAbove, ...textInputProps },
        ref
    ) {
        const ctx = useContext(KeyboardScrollContext);

        if (!ctx) {
            return <TextInput ref={ref} {...textInputProps} />;
        }

        return (
            <ScrollInputField
                gapAboveKeyboard={gapAboveKeyboard}
                fieldTopOffset={fieldTopOffset}
                includeLabelAbove={includeLabelAbove}
            >
                <TextInput ref={ref} {...textInputProps} />
            </ScrollInputField>
        );
    }
);
