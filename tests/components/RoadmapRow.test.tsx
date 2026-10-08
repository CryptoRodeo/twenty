import { render, screen } from '@testing-library/react-native';
import { RoadmapRow } from '@/components/RoadmapRow';
import { levelByOrder } from '@/domain/levels';

describe('RoadmapRow', () => {
  it('shows the level name and both targets', () => {
    render(<RoadmapRow level={levelByOrder(1)} status="LOCKED" reachedAt={null} isLast={false} />);
    expect(screen.getByText('1B')).toBeTruthy();
    expect(screen.getByText('6-ct: 50   Navy: 20')).toBeTruthy();
  });

  it('shows Completed with the date it was reached', () => {
    render(
      <RoadmapRow
        level={levelByOrder(1)}
        status="COMPLETED"
        reachedAt="2026-09-03T06:00:00.000Z"
        isLast={false}
      />,
    );
    expect(screen.getByText(/Completed/)).toBeTruthy();
    expect(screen.getByText(/3\/9/)).toBeTruthy();
  });

  it('shows Current and Locked', () => {
    const current = render(<RoadmapRow level={levelByOrder(9)} status="CURRENT" reachedAt={null} isLast={false} />);
    expect(current.getByText('Current')).toBeTruthy();
    const locked = render(<RoadmapRow level={levelByOrder(10)} status="LOCKED" reachedAt={null} isLast />);
    expect(locked.getByText('Locked')).toBeTruthy();
  });

  it('spells out the graduation rules on the graduation row', () => {
    render(<RoadmapRow level={levelByOrder(10)} status="LOCKED" reachedAt={null} isLast />);
    expect(screen.getByText(/same calendar week/i)).toBeTruthy();
    expect(screen.getByText(/every 30 days/i)).toBeTruthy();
  });

  it('shows the expiry countdown when given one', () => {
    render(
      <RoadmapRow
        level={levelByOrder(10)} status="CURRENT" reachedAt={null} isLast
        expiryWarning="Graduation expires in 12 days"
      />,
    );
    expect(screen.getByText('Graduation expires in 12 days')).toBeTruthy();
  });
});
