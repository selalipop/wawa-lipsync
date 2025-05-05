export const Basic = () => {
  return (
    <>
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="orange"
          emissive="orange"
          emissiveIntensity={3}
        />
      </mesh>
    </>
  );
};
