import PhotoHistory from "@/components/PhotoHistory";

const MinhasFotos = () => {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PhotoHistory onSelectPhoto={() => {}} refreshTrigger={0} />
    </div>
  );
};

export default MinhasFotos;
