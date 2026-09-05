import clsx from 'clsx';
import { useInView, UseInViewOptions } from 'motion/react';
import { AnimatePresence, motion, Variants } from 'motion/react';
import { CSSProperties, memo, ReactNode, RefObject, useEffect, useRef } from 'react';

import styles from './page-header.module.css';

import { LibraryBackgroundOverlay } from '/@/renderer/features/shared/components/library-background-overlay';
import { useShouldPadTitlebar } from '/@/renderer/hooks';
import { useWindowSettings } from '/@/renderer/store/settings.store';
import { Flex, FlexProps } from '/@/shared/components/flex/flex';
import { Platform } from '/@/shared/types/types';

export interface PageHeaderProps extends Omit<
    FlexProps,
    'onAnimationStart' | 'onDrag' | 'onDragEnd' | 'onDragStart'
> {
    animated?: boolean;
    backgroundColor?: string;
    backgroundOpacity?: number;
    children?: ReactNode;
    fadeOnScroll?: boolean;
    height?: string;
    isHidden?: boolean;
    position?: string;
    revealBefore?: number;
    scrollContainerRef?: RefObject<HTMLDivElement | null>;
    target?: RefObject<HTMLElement | null>;
}

export const PAGE_HEADER_HEIGHT = 65;

export const getPageHeaderBottom = (windowBarStyle: Platform) =>
    PAGE_HEADER_HEIGHT +
    (windowBarStyle === Platform.WINDOWS || windowBarStyle === Platform.MACOS ? 30 : 0);

const variants: Variants = {
    animate: {
        opacity: 1,
        transition: {
            duration: 0.3,
            ease: 'easeIn',
        },
    },
    exit: { opacity: 0 },
    initial: { opacity: 0 },
};

const BasePageHeader = ({
    animated,
    backgroundColor,
    backgroundOpacity,
    children,
    fadeOnScroll,
    height,
    isHidden,
    position,
    revealBefore,
    scrollContainerRef,
    target,
    ...props
}: PageHeaderProps) => {
    const ref = useRef(null);
    const padRight = useShouldPadTitlebar();
    const { windowBarStyle } = useWindowSettings();

    const targetMargin: UseInViewOptions['margin'] =
        revealBefore === undefined
            ? undefined
            : `-${getPageHeaderBottom(windowBarStyle) + revealBefore}px 0px 0px 0px`;
    const isInView = useInView(
        {
            current: target?.current || null,
        },
        { margin: targetMargin },
    );

    useEffect(() => {
        const headerElement = ref.current as HTMLElement | null;
        const scrollContainer = scrollContainerRef?.current;

        if (!scrollContainerRef) {
            if (headerElement) {
                headerElement.setAttribute('data-visible', isHidden ? 'false' : 'true');
            }
            return undefined;
        }

        if (!scrollContainer || !headerElement) {
            if (headerElement) {
                headerElement.setAttribute('data-visible', 'false');
            }
            return undefined;
        }

        const updateVisibility = () => {
            const dataScrolled = scrollContainer.getAttribute('data-scrolled');
            const isScrolled = dataScrolled === 'true';
            const shouldShow = isScrolled && !isInView;

            if (shouldShow) {
                headerElement.setAttribute('data-visible', 'true');
            } else {
                headerElement.setAttribute('data-visible', 'false');
            }
        };

        updateVisibility();

        const observer = new MutationObserver(updateVisibility);
        observer.observe(scrollContainer, {
            attributeFilter: ['data-scrolled'],
            attributes: true,
        });

        return () => observer.disconnect();
    }, [isInView, scrollContainerRef, isHidden]);

    return (
        <>
            <Flex
                className={clsx(styles.container, fadeOnScroll && styles.fadeOnScroll)}
                data-visible="false"
                ref={ref}
                style={{ height, position: position as CSSProperties['position'] }}
                {...props}
            >
                <div
                    className={clsx(styles.header, {
                        [styles.hidden]: isHidden,
                        [styles.isDraggable]: windowBarStyle === Platform.WEB,
                        [styles.padRight]: padRight,
                    })}
                >
                    <AnimatePresence initial={animated ?? false}>
                        <motion.div
                            animate="animate"
                            className={styles.titleWrapper}
                            exit="exit"
                            initial="initial"
                            variants={variants}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
                {backgroundColor && (
                    <LibraryBackgroundOverlay
                        backgroundColor={backgroundColor}
                        headerRef={ref}
                        opacity={backgroundOpacity}
                    />
                )}
            </Flex>
        </>
    );
};

export const PageHeader = memo(BasePageHeader);

PageHeader.displayName = 'PageHeader';
