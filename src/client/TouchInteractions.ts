export namespace TouchInteractions {
    export function TwoHands(pt1: React.Touch, pt2: React.Touch): boolean {
        let dx = Math.abs(pt1.screenX - pt2.screenX)
        let dy = Math.abs(pt1.screenY - pt2.screenY)
        let width = window.screen.width
        let height = window.screen.height
        console.log(`x: ${dx} / ${width}`)
        console.log(`y: ${dy} / ${height}`)

        return (dx > width / 10 || dy > height / 5)
    }

    export function Pinching(pt1: React.Touch, pt2: React.Touch, oldPoint1: React.Touch, oldPoint2: React.Touch): number {
        const leniency = 10
        let dist1 = Math.sqrt(Math.pow(oldPoint1.clientX - pt1.clientX, 2) + Math.pow(oldPoint1.clientY - pt1.clientY, 2)) + leniency
        let dist2 = Math.sqrt(Math.pow(oldPoint2.clientX - pt2.clientX, 2) + Math.pow(oldPoint2.clientY - pt2.clientY, 2)) + leniency

        if (Math.sign(dist1) === Math.sign(dist2)) {
            let oldDist = Math.sqrt(Math.pow(oldPoint1.clientX - oldPoint2.clientX, 2) + Math.pow(oldPoint1.clientY - oldPoint2.clientY, 2))
            let newDist = Math.sqrt(Math.pow(pt1.clientX - pt2.clientX, 2) + Math.pow(pt1.clientY - pt2.clientY, 2))
            return Math.sign(oldDist - newDist)
        }
        return 0
    }

    export function IsDragging(oldTouches: Map<number, React.Touch>, newTouches: TouchList, leniency: number): boolean {
        for (let i = 0; i < newTouches.length; i++) {
            let touch = newTouches.item(i)
            if (touch) {
                let oldTouch = oldTouches.get(touch.identifier)
                if (oldTouch) {
                    let dist = Math.sqrt(Math.pow(touch.clientX - oldTouch.clientX, 2) + Math.pow(touch.clientY - oldTouch.clientY, 2))
                    if (dist >= leniency) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}